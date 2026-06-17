export interface Subtask {
  text: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  subtasks: Subtask[];
  priority: "high" | "medium" | "low";
  status: "todo" | "in_progress" | "done";
  startDate: string | null;
  dueDate: string | null;
  dueTime: string | null;
  category: string;
  notes: string;
  links: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ParsedTask {
  title: string;
  subtasks: string[];
  priority: "high" | "medium" | "low";
  startDate: string | null;
  dueDate: string | null;
  dueTime: string | null;
  category: string;
  notes: string;
  links: string[];
}

export interface AdjustedTask extends ParsedTask {
  status: "todo" | "in_progress" | "done";
}
