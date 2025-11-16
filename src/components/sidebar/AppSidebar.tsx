"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

import { useUser } from "@clerk/nextjs";
import { SignOutButton, useClerk } from "@clerk/clerk-react";
import { useSessions } from "@/hooks/use-sessions-query";
import { useDeepSearchSessions } from "@/hooks/use-deep-search-sessions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import HistoryDialog from "./HistoryDialog";
import { Input } from "@/components/ui/input";
import { Globe, Search, BookOpen, BlocksIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { Separator } from "../ui/separator";

export default function AppSidebar() {
  const { user } = useUser();
  const { openUserProfile } = useClerk();
  const pathname = usePathname();
  const {
    sessions: webSessions,
    loading: webLoading,
    deleteSession: deleteWebSession,
    updateTitle: updateWebTitle,
    isDeleting: isDeletingWeb,
  } = useSessions();
  const {
    sessions: deepSearchSessions,
    loading: deepLoading,
    deleteSession: deleteDeepSearchSession,
    updateTitle: updateDeepSearchTitle,
    isDeleting: isDeletingDeep,
  } = useDeepSearchSessions();
  const [editingSession, setEditingSession] = useState<{
    id: string;
    title: string;
    type: "web" | "deep";
  } | null>(null);
  const [editedTitle, setEditedTitle] = useState("");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deleteSessionData, setDeleteSessionData] = useState<{
    id: string;
    type: "web" | "deep";
  } | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const handleStartEdit = (
    sessionId: string,
    currentTitle: string,
    type: "web" | "deep"
  ) => {
    setEditingSession({ id: sessionId, title: currentTitle, type });
    setEditedTitle(currentTitle);
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingSession || !editedTitle.trim()) return;

    try {
      if (editingSession.type === "web") {
        await updateWebTitle({
          sessionId: editingSession.id,
          title: editedTitle.trim(),
        });
      } else {
        await updateDeepSearchTitle({
          sessionId: editingSession.id,
          title: editedTitle.trim(),
        });
      }
      setIsEditDialogOpen(false);
      setEditingSession(null);
      setEditedTitle("");
      toast.success("Session title updated successfully");
    } catch {
      toast.error("Failed to update session title");
    }
  };

  const handleCancelEdit = () => {
    setIsEditDialogOpen(false);
    setEditingSession(null);
    setEditedTitle("");
  };

  const handleDeleteConfirm = async () => {
    if (!deleteSessionData) return;

    try {
      if (deleteSessionData.type === "web") {
        await deleteWebSession(deleteSessionData.id);
      } else {
        await deleteDeepSearchSession(deleteSessionData.id);
      }
      setDeleteSessionData(null);
      toast.success("Session deleted successfully");
    } catch {
      toast.error("Failed to delete session");
    }
  };

  return (
    <>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2 w-full justify-between">
            <h1 className=" text-2xl font-bold text-primary font-sans">
              Unifero
            </h1>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigate</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/"}>
                    <Link href="/">
                      <div className="flex items-center gap-2">
                        <BlocksIcon className="size-4 flex-shrink-0 text-muted-foreground" />
                        <span>Dashboard</span>
                      </div>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      pathname === "/web-search" ||
                      pathname?.startsWith("/chat")
                    }
                  >
                    <Link href="/web-search">
                      <div className="flex items-center gap-2">
                        <Globe className="size-4 flex-shrink-0 text-muted-foreground" />
                        <span>Web Search</span>
                      </div>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname?.startsWith("/deep-search")}
                  >
                    <Link href="/deep-search">
                      <div className="flex items-center gap-2">
                        <Search className="size-4 flex-shrink-0 text-muted-foreground" />
                        <span>Deep Search</span>
                      </div>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname?.startsWith("/knowledge-base")}
                  >
                    <Link href="/knowledge-base">
                      <div className="flex items-center gap-2">
                        <BookOpen className="size-4 flex-shrink-0 text-muted-foreground" />
                        <span className="opacity-50">Knowledge Base</span>
                      </div>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <div className="px-2 flex items-center text-muted-foreground text-sm gap-2 justify-between">
            <div className="flex items-center gap-2">
              Theme
              <ModeToggle />
            </div>

            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsHistoryOpen(true)}
              >
                History
              </Button>
            </div>
          </div>

          <Separator />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="flex justify-start items-center gap-2"
                size={"lg"}
                variant={"ghost"}
              >
                <Avatar className=" h-6 w-6">
                  <AvatarImage
                    src={user?.imageUrl || undefined}
                    alt={user?.firstName || "User"}
                  />
                  <AvatarFallback>
                    {user?.firstName?.[0] ||
                      user?.emailAddresses?.[0]?.emailAddress?.[0] ||
                      "U"}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate text-xs text-muted-foreground">
                  {user?.emailAddresses[0]?.emailAddress}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => openUserProfile()}>
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="w-full">
                <SignOutButton>Sign out</SignOutButton>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>

      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          if (!isDeletingWeb && !isDeletingDeep && !open) {
            setIsEditDialogOpen(false);
            setEditingSession(null);
            setEditedTitle("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit chat title</DialogTitle>
            <DialogDescription>
              Update the title for this conversation.
            </DialogDescription>
          </DialogHeader>

          <div className="pt-2">
            <Input
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSaveEdit();
                } else if (e.key === "Escape") {
                  handleCancelEdit();
                }
              }}
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={handleCancelEdit}
              disabled={isDeletingWeb || isDeletingDeep}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} className="ml-2">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteSessionData}
        onOpenChange={(open) => {
          if (!isDeletingWeb && !isDeletingDeep && !open) {
            setDeleteSessionData(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Session</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this session? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingWeb || isDeletingDeep}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeletingWeb || isDeletingDeep}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingWeb || isDeletingDeep ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <HistoryDialog
        open={isHistoryOpen}
        onOpenChange={(open) => setIsHistoryOpen(open)}
        webSessions={webSessions}
        deepSearchSessions={deepSearchSessions}
        loading={webLoading || deepLoading}
        onEdit={handleStartEdit}
        onDelete={(id, type) => setDeleteSessionData({ id, type })}
      />
    </>
  );
}
