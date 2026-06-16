import { supabase } from "./supabase";
import type { Task, Subtask } from "@/types/task";

// ─── Generate sequential t-series ID ────────
export async function nextId(): Promise<string> {
  const { data } = await supabase
    .from("tasks")
    .select("id")
    .like("id", "t%")
    .order("id", { ascending: false })
    .limit(1);
  let next = 1;
  if (data && data.length > 0) {
    const match = data[0].id.match(/^t(\d+)$/);
    if (match) next = parseInt(match[1], 10) + 1;
  }
  return `t${String(next).padStart(3, "0")}`;
}

// Generate N sequential IDs starting from the next available
export async function nextIds(count: number): Promise<string[]> {
  const { data } = await supabase
    .from("tasks")
    .select("id")
    .like("id", "t%")
    .order("id", { ascending: false })
    .limit(1);
  let next = 1;
  if (data && data.length > 0) {
    const match = data[0].id.match(/^t(\d+)$/);
    if (match) next = parseInt(match[1], 10) + 1;
  }
  return Array.from({ length: count }, (_, i) => `t${String(next + i).padStart(3, "0")}`);
}

// ─── Fetch all tasks ────────────────────────
export async function fetchTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data || []).map(rowToTask);
}

// ─── Create a task ──────────────────────────
export async function createTask(task: Omit<Task, "id" | "createdAt" | "updatedAt">): Promise<Task> {
  const id = await nextId();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      id,
      title: task.title,
      subtasks: task.subtasks,
      priority: task.priority,
      status: task.status,
      start_date: task.startDate,
      due_date: task.dueDate,
      category: task.category,
      notes: task.notes,
      links: task.links,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) throw error;
  return rowToTask(data);
}

// ─── Update a task ──────────────────────────
export async function updateTask(task: Task): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .update({
      title: task.title,
      subtasks: task.subtasks,
      priority: task.priority,
      status: task.status,
      start_date: task.startDate,
      due_date: task.dueDate,
      category: task.category,
      notes: task.notes,
      links: task.links,
      updated_at: new Date().toISOString(),
    })
    .eq("id", task.id)
    .select()
    .single();

  if (error) throw error;
  return rowToTask(data);
}

// ─── Delete a task ──────────────────────────
export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

// ─── Delete all done tasks ──────────────────
export async function deleteDoneTasks(): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("status", "done");
  if (error) throw error;
}

// ─── Reorder tasks (update sort_order) ──────
export async function reorderTasks(taskIds: string[]): Promise<void> {
  // Batch update sort_order
  const updates = taskIds.map((id, index) => ({
    id,
    sort_order: index,
    updated_at: new Date().toISOString(),
  }));

  for (const u of updates) {
    await supabase
      .from("tasks")
      .update({ sort_order: u.sort_order, updated_at: u.updated_at })
      .eq("id", u.id);
  }
}

// ─── Row mapper ─────────────────────────────
function rowToTask(row: any): Task {
  return {
    id: row.id,
    title: row.title,
    subtasks: row.subtasks || [],
    priority: row.priority,
    status: row.status,
    startDate: row.start_date,
    dueDate: row.due_date,
    category: row.category || "",
    notes: row.notes || "",
    links: row.links || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
