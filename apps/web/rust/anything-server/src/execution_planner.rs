use std::collections::VecDeque;
use std::collections::HashMap;
use postgrest::Postgrest; 

use dotenv::dotenv;
use std::env;

use crate::workflow_types::{Task, Workflow, Action, PluginType, CreateTaskInput, FlowVersion, TaskConfig};

pub async fn process_trigger_task(
    client: &Postgrest,
    task: &Task,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    println!("[TASK_ENGINE] Processing trigger task");

    dotenv().ok();
    let supabase_service_role_api_key = env::var("SUPABASE_SERVICE_ROLE_API_KEY")
        .expect("SUPABASE_SERVICE_ROLE_API_KEY must be set");

    // Fetch the flow version from the database
    let response = client
        .from("flow_versions")
        .auth(&supabase_service_role_api_key)
        .select("*")
        .eq("flow_version_id", task.flow_version_id.to_string())
        .limit(1)
        .execute()
        .await
        .map_err(|e| {
            println!("[TASK_ENGINE] Error executing request: {:?}", e);
            e
        })?;

    let body = response.text().await.map_err(|e| {
        println!("[TASK_ENGINE] Error reading response body: {:?}", e);
        e
    })?;

    let flow_versions: Vec<FlowVersion> = serde_json::from_str(&body).map_err(|e| {
        println!("[TASK_ENGINE] Error parsing JSON: {:?}", e);
        e
    })?;

    let flow_version = flow_versions.into_iter().next().ok_or_else(|| {
        let error_msg = format!("No flow version found for id: {}", task.flow_version_id);
        println!("[TASK_ENGINE] {}", error_msg);
        error_msg
    })?;

    // Create the execution plan
    let new_tasks = create_execution_plan(task, flow_version).await?;

    // Insert the new tasks into the database
    client
        .from("tasks")
        .auth(&supabase_service_role_api_key)
        .insert(serde_json::to_string(&new_tasks)?)
        .execute()
        .await
        .map_err(|e| {
            println!("[TASK_ENGINE] Error inserting new tasks: {:?}", e);
            e
        })?;

    println!("[TASK_ENGINE] Trigger task processed successfully");
    Ok(())
}
// pub async fn process_trigger_task(
//     client: &Postgrest,
//     task: &Task,
// ) -> Result<(), Box<dyn std::error::Error>> {
//     println!("process_trigger_task");

//     dotenv().ok();
//     let supabase_service_role_api_key = env::var("SUPABASE_SERVICE_ROLE_API_KEY").expect("SUPABASE_SERVICE_ROLE_API_KEY must be set");

//     // Fetch the flow version from the database
//     let response = match client
//         .from("flow_versions")
//         .auth(supabase_service_role_api_key.clone())
//         .select("*")
//         .eq("flow_version_id", task.flow_version_id.to_string())
//         .limit(1)
//         .execute()
//         .await
//     {
//         Ok(response) => response,
//         Err(e) => {
//             println!("Error executing request: {:?}", e);
//             return Err(Box::new(e));
//         },
//     };

//     let body = match response.text().await {
//         Ok(body) => body,
//         Err(e) => {
//             println!("Error reading response body: {:?}", e);
//             return Err(Box::new(e));
//         },
//     };

//     // println!("Response body: {}", body);

//     let flow_versions: Vec<FlowVersion> = match serde_json::from_str(&body) {
//         Ok(flow_versions) => flow_versions,
//         Err(e) => {
//             println!("Error parsing JSON: {:?}", e);
//             return Err(Box::new(e));
//         },
//     };

//     let flow_version = match flow_versions.into_iter().next() {
//         Some(flow_version) => flow_version,
//         None => {
//             println!("No flow version found for id: {}", task.flow_version_id);
//             return Err("No flow version found".into());
//         }
//     };

//     // Create the execution plan
//     let new_tasks = create_execution_plan(task, flow_version).await?;

//     // Insert the events into the database in a single transaction
//     client
//         .from("tasks")
//         .auth(supabase_service_role_api_key)
//         // .insert(serde_json::json!(&events))
//         .insert(serde_json::to_string(&new_tasks).unwrap())
//         .execute()
//         .await?;

//     Ok(())
// }

async fn create_execution_plan(
    task: &Task,
    flow_version: FlowVersion,
) -> Result<Vec<CreateTaskInput>, Box<dyn std::error::Error + Send + Sync>> {
    println!("[EXECUTION_PLANNER] Creating execution plan");

    // Deserialize the flow definition into a Workflow struct
    let workflow: Workflow = serde_json::from_value(flow_version.flow_definition)
        .map_err(|e| {
            println!("[EXECUTION_PLANNER] Error deserializing workflow: {:?}", e);
            e
        })?;

    // Traverse the workflow to get the list of actions in BFS order, excluding the trigger
    let result = bfs_traversal(&workflow)?;

    let mut events = Vec::new();

    for (index, action) in result.iter().enumerate() {
        let task_config = TaskConfig {
            variables: serde_json::json!(action.variables),
            inputs: serde_json::json!(action.input),
        };

        let event = CreateTaskInput {
            account_id: task.account_id.to_string(),
            task_status: "pending".to_string(),
            flow_id: task.flow_id.to_string(),
            flow_version_id: task.flow_version_id.to_string(),
            flow_version_name: task.flow_version_name.clone().unwrap_or_else(|| "unknown".to_string()),
            trigger_id: task.trigger_id.clone(),
            trigger_session_id: task.trigger_session_id.clone(),
            trigger_session_status: "pending".to_string(),
            flow_session_id: task.flow_session_id.clone(),
            flow_session_status: "pending".to_string(),
            node_id: action.node_id.clone(),
            is_trigger: false,
            plugin_id: action.plugin_id.clone(),
            stage: task.stage.clone(),
            config: serde_json::json!(task_config),
            test_config: None,
            processing_order: (index + 1) as i32,
        };

        events.push(event);
    }

    println!("[EXECUTION_PLANNER] Execution plan created successfully");
    Ok(events)
}

fn bfs_traversal(workflow: &Workflow) -> Result<Vec<&Action>, Box<dyn std::error::Error + Send + Sync>> {
    println!("[EXECUTION_PLANNER] Starting BFS traversal");
    let mut work_list = Vec::new();

    // Create a map of node ids to their outgoing edges
    let mut graph = HashMap::new();
    for edge in &workflow.edges {
        graph.entry(&edge.source).or_insert_with(Vec::new).push(&edge.target);
    }

    // Use a BFS queue
    let mut queue = VecDeque::new();

    // Find the trigger action and enqueue its neighbors
    let trigger = workflow
        .actions
        .iter()
        .find(|action| matches!(action.r#type, PluginType::Trigger))
        .ok_or_else(|| {
            let error_msg = "Trigger not found in workflow".to_string();
            println!("[EXECUTION_PLANNER] Error: {}", error_msg);
            error_msg
        })?;

    if let Some(neighbors) = graph.get(&trigger.node_id) {
        for neighbor_id in neighbors {
            if let Some(neighbor) = workflow
                .actions
                .iter()
                .find(|action| &action.node_id == *neighbor_id)
            {
                queue.push_back(neighbor);
            }
        }
    }

    // BFS traversal
    while let Some(current) = queue.pop_front() {
        // Add current node to the work list, skipping the trigger action
        if !matches!(current.r#type, PluginType::Trigger) {
            work_list.push(current);
        }

        // Enqueue neighbors
        if let Some(neighbors) = graph.get(&current.node_id) {
            for neighbor_id in neighbors {
                if let Some(neighbor) = workflow
                    .actions
                    .iter()
                    .find(|action| &action.node_id == *neighbor_id)
                {
                    queue.push_back(neighbor);
                }
            }
        }
    }

    println!("[EXECUTION_PLANNER] BFS traversal completed successfully");
    Ok(work_list)
}

// async fn create_execution_plan(
//     task: &Task,
//     flow_version: FlowVersion,
// ) -> Result<Vec<CreateTaskInput>, Box<dyn std::error::Error>> {
//     // Deserialize the flow definition into a Workflow struct
//     let workflow: Workflow = serde_json::from_value(flow_version.flow_definition)?;

//     // Traverse the workflow to get the list of actions in BFS order, excluding the trigger
//     let result = bfs_traversal(&workflow);

//     let mut events = Vec::new();

//     let mut index = 1; 

//     for action in result.iter() {

//         //TODO: manage this working with testing for stages
//         let task_config = TaskConfig {
//             variables: serde_json::json!(action.variables), 
//             inputs: serde_json::json!(action.input), 
//         }; 

//         // let testConfig = TestConfig {
//         //     action_id: None,
//         //     variables: serde_json::json!({}),
//         //     inputs: serde_json::json!({}),
//         // }; 

//         let event = CreateTaskInput {
//             account_id: task.account_id.to_string(),
//             task_status: "pending".to_string(),
//             flow_id: task.flow_id.to_string(),
//             flow_version_id: task.flow_version_id.to_string(),
//             flow_version_name: task.flow_version_name.clone().unwrap_or_else(|| "unknown".to_string()),
//             trigger_id: task.trigger_id.clone(),
//             trigger_session_id: task.trigger_session_id.clone(),
//             trigger_session_status: "pending".to_string(),
//             flow_session_id: task.flow_session_id.clone(),
//             flow_session_status: "pending".to_string(),
//             node_id: action.node_id.clone(),
//             is_trigger: false,
//             plugin_id: action.plugin_id.clone(),
//             stage: task.stage.clone(),
//             config: serde_json::json!(task_config),
//             test_config: None, 
//             processing_order: index, 
//         };

//         index += 1;

//         events.push(event);
//     }

//     Ok(events)
// }

// fn bfs_traversal(workflow: &Workflow) -> Vec<&Action> {
//     println!("bfs_traversal");
//     // Resultant list of work
//     let mut work_list = Vec::new();

//     // Create a map of node ids to their outgoing edges
//     let mut graph = HashMap::new();
//     for edge in &workflow.edges {
//         graph.entry(&edge.source).or_insert_with(Vec::new).push(&edge.target);
//     }

//     // Use a BFS queue
//     let mut queue = VecDeque::new();

//     // Find the trigger action and enqueue its neighbors
//     let trigger = workflow
//         .actions
//         .iter()
//         .find(|action| matches!(action.r#type, PluginType::Trigger))
//         .expect("Trigger not found in workflow");

//     if let Some(neighbors) = graph.get(&trigger.node_id) {
//         for neighbor_id in neighbors {
//             if let Some(neighbor) = workflow
//                 .actions
//                 .iter()
//                 .find(|action| &action.node_id == *neighbor_id)
//             {
//                 queue.push_back(neighbor);
//             }
//         }
//     }

//     // BFS traversal
//     while let Some(current) = queue.pop_front() {
//         // Add current node to the work list, skipping the trigger action
//         if !matches!(current.r#type, PluginType::Trigger) {
//             work_list.push(current);
//         }

//         // Enqueue neighbors
//         if let Some(neighbors) = graph.get(&current.node_id) {
//             for neighbor_id in neighbors {
//                 if let Some(neighbor) = workflow
//                     .actions
//                     .iter()
//                     .find(|action| &action.node_id == *neighbor_id)
//                 {
//                     queue.push_back(neighbor);
//                 }
//             }
//         }
//     }

//     work_list
// }