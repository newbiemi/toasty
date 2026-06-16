-- ─── Task Parser: Supabase Schema ───────────
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- Create the tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtasks JSONB DEFAULT '[]',
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  start_date DATE,
  due_date DATE,
  category TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  links JSONB DEFAULT '[]',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_sort_order ON tasks(sort_order);

-- Enable Row Level Security (optional, for multi-user later)
-- ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow all for now" ON tasks FOR ALL USING (true);

-- ─── Done! Your table is ready. ─────────────
