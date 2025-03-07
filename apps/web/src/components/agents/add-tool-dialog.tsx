"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/ui/sheet";
import { ScrollArea } from "@repo/ui/components/ui/scroll-area";
import { useAnything } from "@/context/AnythingContext";
import { createClient } from "@/lib/supabase/client";
import api from "@repo/anything-api";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@repo/ui/components/ui/button";
import { AlertTriangle, Loader2, Plus } from "lucide-react";
import NewToolDialog from "@/components/agents/new-tool-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";

interface AddToolDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToolAdd: (toolId: string) => Promise<void>;
}

export function AddToolDialog({
  open,
  onOpenChange,
  onToolAdd,
}: AddToolDialogProps): JSX.Element {
  const {
    accounts: { selectedAccount },
  } = useAnything();
  const router = useRouter();

  const [tools, setTools] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddingTool, setIsAddingTool] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isCreatingTool, setIsCreatingTool] = useState(false);
  const [loadingToolId, setLoadingToolId] = useState<string | null>(null);
  const params = useParams<{ agentId: string }>();

  const createTool = async (name: string, description: string) => {
    if (!selectedAccount) {
      console.error("No account selected");
      return;
    }

    if (!name || name.trim() === "" || !description || description.trim() === "") {
      console.error("Name and description are required");
      return;
    }

    setIsCreatingTool(true);
    try {
      let res = await api.flows.createFlow(
        await createClient(),
        selectedAccount.account_id,
        name.trim(),
        description.trim(),
        "tool",
      );
      console.log("created workflow", res);
      setShowCreateDialog(false);
      router.push(
        `/workflows/${res.workflow_id}/${res.workflow_version_id}/editor`,
      );
    } catch (error) {
      console.error("error creating workflow", error);
    } finally {
      setIsCreatingTool(false);
    }
  };

  const fetchTools = async () => {
    setIsLoading(true);
    try {
      if (!selectedAccount) {
        console.error("No account selected");
        return;
      }
      const res = await api.flows.getToolFlows(
        await createClient(),
        selectedAccount.account_id,
      );
      console.log("tools res:", res);
      if (res && Array.isArray(res)) {
        setTools(res);
      }
    } catch (error) {
      console.error("Error fetching tools:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchTools();
    }
  }, [open, selectedAccount]);

  const handleToolClick = async (toolId: string) => {
    setIsAddingTool(true);
    setLoadingToolId(toolId);
    try {
      await onToolAdd(toolId);
      onOpenChange(false);
    } catch (error) {
      console.error("Error adding tool:", error);
    } finally {
      setIsAddingTool(false);
      setLoadingToolId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={"bottom"} className="h-4/5 flex flex-col">
        <SheetHeader className="flex flex-row justify-between pr-20">
          <div className="flex flex-col">
            <SheetTitle>Add Tool</SheetTitle>
            <SheetDescription>
              Browse and add tools to your agent
            </SheetDescription>
          </div>
          <Button
            onClick={() => setShowCreateDialog(true)}
            disabled={isCreatingTool}
            size="sm"
            className="mt-2"
          >
            {isCreatingTool ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Create Tool
              </>
            )}
          </Button>
        </SheetHeader>

        <div className="py-4 flex-grow overflow-hidden">
          <ScrollArea className="h-full pr-4 pb-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : tools.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full space-y-4">
                <p className="text-muted-foreground text-center">
                  No tools available. Create your first tool to get started.
                </p>
                <Button
                  onClick={() => setShowCreateDialog(true)}
                  disabled={isCreatingTool}
                >
                  {isCreatingTool ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating Tool...
                    </>
                  ) : (
                    "Create Your First Tool"
                  )}
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {tools.map((tool: any) => {
                  let marketplace: boolean = "featured" in tool;
                  const isLoading = loadingToolId === tool.flow_id;
                  const isPublished = tool.flow_versions?.[0]?.published;

                  return (
                    <TooltipProvider key={`${tool.flow_id}`}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            onClick={() =>
                              !isAddingTool &&
                              isPublished &&
                              handleToolClick(tool.flow_id)
                            }
                            className={`flex flex-col justify-between p-4 border rounded-md border-black relative
                              ${isAddingTool || !isPublished ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-gray-50"}`}
                          >
                            <div className="flex flex-row gap-4 items-center">
                              {isLoading ? (
                                <Loader2 className="w-6 h-6 animate-spin" />
                              ) : (
                                <> </>
                              )}
                              <div className="min-w-0">
                                <div className="text-lg font-semibold truncate">
                                  {tool.flow_name}
                                </div>
                                <div className="text-sm font-normal truncate">
                                  {tool.description}
                                </div>
                              </div>
                            </div>
                            {!isPublished && (
                              <div className="absolute top-2 right-2">
                                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                              </div>
                            )}
                          </div>
                        </TooltipTrigger>
                        {!isPublished && (
                          <TooltipContent>
                            <p>
                              To use this tool, you must publish the workflow
                              first.{" "}
                              <a
                                href={`/workflows/${tool.flow_id}`}
                                className="text-blue-500 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Click here to edit and publish
                              </a>
                            </p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </div>
            )}
            <div className="h-12" />
          </ScrollArea>
        </div>
      </SheetContent>
      <NewToolDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreateTool={createTool}
      />
    </Sheet>
  );
}
