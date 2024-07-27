use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::task;
use tokio::time::{sleep, Duration};

use postgrest::Postgrest;

use dotenv::dotenv;
use std::env;

use reqwest::Client;

use uuid::Uuid;

use crate::AppState;
use crate::workflow_types::Task;
use crate::execution_planner::process_trigger_task;
use crate::bundler::bundle_context;

use serde_json::Value;

use crate::task_types::Stage;

pub async fn fetch_task(client: &Postgrest, stage: &Stage) -> Option<Task> {
    println!("[TASK_ENGINE] Looking for oldest pending task in stage {}", stage.as_str());

    dotenv().ok();
    let supabase_service_role_api_key = env::var("SUPABASE_SERVICE_ROLE_API_KEY").expect("SUPABASE_SERVICE_ROLE_API_KEY must be set");

    let response = match client
        .from("tasks")
        .auth(supabase_service_role_api_key.clone())
        .select("*")
        .eq("task_status", "pending")
        .eq("stage", stage.as_str())
        .order("created_at.asc")
        .limit(1)
        .execute()
        .await
    {
        Ok(response) => response,
        Err(e) => {
            println!("[TASK_ENGINE] Error executing request: {:?}", e);
            return None;
        },
    };

    if !response.status().is_success() {
        println!("[TASK_ENGINE] Request failed with status: {}", response.status());
        return None;
    }

    let body = match response.text().await {
        Ok(body) => body,
        Err(e) => {
            println!("[TASK_ENGINE] Error reading response body: {:?}", e);
            return None;
        },
    };

    let tasks: Vec<Task> = match serde_json::from_str(&body) {
        Ok(tasks) => tasks,
        Err(e) => {
            println!("[TASK_ENGINE] Error parsing JSON: {:?}", e);
            return None;
        },
    };

    tasks.into_iter().next()
}

pub async fn fetch_flow_tasks(client: &Postgrest, flow_id: &Uuid) -> Option<Vec<Task>> {
    println!("[TASK_ENGINE] Fetching tasks for flow_id {}", flow_id);

    dotenv().ok();
    let supabase_service_role_api_key = env::var("SUPABASE_SERVICE_ROLE_API_KEY").expect("SUPABASE_SERVICE_ROLE_API_KEY must be set");

    let response = match client
        .from("tasks")
        .auth(supabase_service_role_api_key.clone())
        .select("*")
        .eq("flow_id", flow_id.to_string())
        .order("processing_order.asc")
        .execute()
        .await
    {
        Ok(response) => response,
        Err(e) => {
            println!("[TASK_ENGINE] Error executing request: {:?}", e);
            return None;
        },
    };

    if !response.status().is_success() {
        println!("[TASK_ENGINE] Request failed with status: {}", response.status());
        return None;
    }

    let body = match response.text().await {
        Ok(body) => body,
        Err(e) => {
            println!("[TASK_ENGINE] Error reading response body: {:?}", e);
            return None;
        },
    };

    let tasks: Vec<Task> = match serde_json::from_str(&body) {
        Ok(tasks) => tasks,
        Err(e) => {
            println!("[TASK_ENGINE] Error parsing JSON: {:?}", e);
            return None;
        },
    };

    if tasks.is_empty() {
        return None;
    }

    Some(tasks)
}

#[derive(Debug, Deserialize, Serialize)]
pub struct UpdateTaskInput {
    task_status: String,
}

pub async fn update_task_status(client: &Postgrest, task: &Task, status: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    dotenv().ok();
    let supabase_service_role_api_key = env::var("SUPABASE_SERVICE_ROLE_API_KEY")
        .expect("SUPABASE_SERVICE_ROLE_API_KEY must be set");

    let input = UpdateTaskInput {
        task_status: status.to_string(),
    };

    client
        .from("tasks")
        .auth(supabase_service_role_api_key)
        .eq("task_id", &task.task_id.to_string())
        .update(serde_json::to_string(&input)?)
        .execute()
        .await?;

    Ok(())
}

// Process all tasks in a flow sequentially
pub async fn process_flow_tasks(client: &Postgrest, flow_id: &Uuid) {
    if let Some(tasks) = fetch_flow_tasks(client, flow_id).await {
        for task in &tasks {
            //Process tasks that are waiting. This also helps skip trigger if its in this list
            if task.task_status == "pending" {
                // Process each task in the flow sequentially
                if let Err(e) = process_task(client, task).await {
                    println!("[TASK_ENGINE] Error processing task {}: {}", task.task_id, e);
                    // Update remaining tasks to error state
                    for remaining_task in &tasks {
                        if remaining_task.task_status != "completed" {
                            if let Err(update_err) = update_task_status(client, remaining_task, "cancelled").await {
                                println!("[TASK_ENGINE] Error updating task status: {}", update_err);
                            }
                        }
                    }
                    break;
                }
            }
        }
    }
}

// Update the process_task function to handle task status updates
pub async fn process_task(client: &Postgrest, task: &Task) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    println!("[TASK_ENGINE] Processing task {}", task.task_id);

    // Update task status to "processing"
    update_task_status(client, task, "processing").await?;

    let result = async {
        let bundled_context = bundle_context(client, task).await?;

        if task.is_trigger {
            println!("[TASK_ENGINE] Processing trigger task {}", task.task_id);
            process_trigger_task(client, task).await?;
        } else {
            println!("[TASK_ENGINE] Processing regular task {}", task.task_id);
            if let Some(plugin_id) = &task.plugin_id {
                if plugin_id == "http" {
                    process_http_task(&bundled_context).await?;
                } else {
                    println!("[TASK_ENGINE] Processed task {} with plugin_id {}", task.task_id, plugin_id);
                }
            } else {
                println!("[TASK_ENGINE] No plugin_id found for task {}", task.task_id);
            }
        }

        Ok(())
    }.await;

    match result {
        Ok(_) => {
            // Update task status to "completed"
            update_task_status(client, task, "completed").await?;
            println!("[TASK_ENGINE] Task {} completed successfully", task.task_id);
            Ok(())
        }
        Err(e) => {
            // Update task status to "error"
            update_task_status(client, task, "error").await?;
            println!("[TASK_ENGINE] Task {} failed: {}", task.task_id, e);
            Err(e)
        }
    }
}

async fn process_http_task(bundled_context: &Value) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    if let (Some(method), Some(url)) = (
        bundled_context.get("method").and_then(Value::as_str),
        bundled_context.get("url").and_then(Value::as_str),
    ) {
        println!("[TASK_ENGINE] Processing HTTP task");
        let client = Client::new();
        let method = match method.to_uppercase().as_str() {
            "GET" => reqwest::Method::GET,
            "POST" => reqwest::Method::POST,
            "PUT" => reqwest::Method::PUT,
            "DELETE" => reqwest::Method::DELETE,
            _ => return Err(format!("Unsupported HTTP method: {}", method).into()),
        };

        let mut request_builder = client.request(method, url);

        if let Some(headers) = bundled_context.get("headers").and_then(Value::as_object) {
            for (key, value) in headers {
                if let Some(value_str) = value.as_str() {
                    request_builder = request_builder.header(key.as_str(), value_str);
                }
            }
        }

        if let Some(body) = bundled_context.get("body").and_then(Value::as_str) {
            request_builder = request_builder.body(body.to_string());
        }

        let response = request_builder.send().await?;
        println!("[TASK_ENGINE] HTTP request response! {:?}", response);
        let text = response.text().await?;
        println!("[TASK_ENGINE] HTTP request successful. Response: {}", text);
    } else {
        return Err("HTTP Missing required fields (method, url) in task context.".into());
    }

    Ok(())
}

// The task processing loop function
pub async fn task_processing_loop(state: Arc<AppState>) {
    // Receive info from other systems
    let mut task_signal_rx = state.task_signal.subscribe();
    let client = state.client.clone();
    let semaphore = state.semaphore.clone();
    // To not hit db like crazy if no work to do
    let mut backoff = Duration::from_millis(200);

    loop {
        tokio::select! {
            _ = task_signal_rx.changed() => {
                println!("[TASK_ENGINE] Received start signal, checking for tasks.");
            }
            _ = sleep(backoff) => {
                // Periodic task checking
            }
        }

        let task_testing = fetch_task(&client, &Stage::Testing).await;
        let task_production = fetch_task(&client, &Stage::Production).await;

        if let Some(task) = task_testing.or(task_production) {
            backoff = Duration::from_millis(200); // Reset backoff when tasks are found
            let client = client.clone();
            let permit = semaphore.clone().acquire_owned().await.unwrap();

            task::spawn(async move {
                // Process the trigger task if it is a trigger
                if task.is_trigger {
                    if let Err(e) = process_task(&client, &task).await {
                        println!("[TASK_ENGINE] Failed to process trigger task: {}", e);
                    }
                }
        
                // Fetch and process the rest of the tasks for the flow
                process_flow_tasks(&client, &task.flow_id).await;
                drop(permit);
            });
        
        } else {
            // Increase the backoff duration, up to a maximum
            backoff = (backoff * 2).min(Duration::from_secs(60));
        }
    }
}
