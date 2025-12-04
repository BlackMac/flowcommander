-- FlowCommander Database Schema
-- Run this in your Supabase SQL Editor to set up the database

-- Enable UUID extension (usually already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  initial_prompt TEXT NOT NULL,
  current_code TEXT,
  sandbox_id TEXT,
  webhook_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Webhook events table (for real-time event log)
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- LLM calls table (for tracking usage from sandbox code)
CREATE TABLE IF NOT EXISTS llm_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  model TEXT NOT NULL,
  input_tokens INT DEFAULT 0,
  output_tokens INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Phone numbers table (for routing incoming calls to projects)
CREATE TABLE IF NOT EXISTS phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT UNIQUE NOT NULL,     -- E.164 format without + (e.g., "4920413487310")
  display_number TEXT NOT NULL,          -- Human-readable format (e.g., "02041-34873-10")
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_project_id ON chat_messages(project_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_project_id ON webhook_events(project_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON webhook_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_calls_project_id ON llm_calls(project_id);
CREATE INDEX IF NOT EXISTS idx_llm_calls_created_at ON llm_calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_phone ON phone_numbers(phone_number);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_project_id ON phone_numbers(project_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_available ON phone_numbers(project_id) WHERE project_id IS NULL;

-- Row Level Security
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for repeatability)
DROP POLICY IF EXISTS "Users can only access their own projects" ON projects;
DROP POLICY IF EXISTS "Users can insert their own projects" ON projects;
DROP POLICY IF EXISTS "Users can update their own projects" ON projects;
DROP POLICY IF EXISTS "Users can delete their own projects" ON projects;

DROP POLICY IF EXISTS "Users can access their project messages" ON chat_messages;
DROP POLICY IF EXISTS "Users can insert messages to their projects" ON chat_messages;

DROP POLICY IF EXISTS "Users can access their project events" ON webhook_events;
DROP POLICY IF EXISTS "Anyone can insert webhook events" ON webhook_events;

DROP POLICY IF EXISTS "Users can access their project LLM calls" ON llm_calls;
DROP POLICY IF EXISTS "Anyone can insert LLM calls" ON llm_calls;

-- Projects policies
CREATE POLICY "Users can only access their own projects"
  ON projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects"
  ON projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects"
  ON projects FOR DELETE
  USING (auth.uid() = user_id);

-- Chat messages policies
CREATE POLICY "Users can access their project messages"
  ON chat_messages FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert messages to their projects"
  ON chat_messages FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

-- Webhook events policies
-- SELECT: Only project owners can view events
CREATE POLICY "Users can access their project events"
  ON webhook_events FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

-- INSERT: Allow webhook proxy to insert events (uses service role key)
-- This policy allows inserts from authenticated users or service role
CREATE POLICY "Anyone can insert webhook events"
  ON webhook_events FOR INSERT
  WITH CHECK (true);

-- LLM calls policies
-- SELECT: Only project owners can view their LLM usage
CREATE POLICY "Users can access their project LLM calls"
  ON llm_calls FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

-- INSERT: Allow LLM proxy to insert calls (uses service role key)
CREATE POLICY "Anyone can insert LLM calls"
  ON llm_calls FOR INSERT
  WITH CHECK (true);

-- Phone numbers policies
DROP POLICY IF EXISTS "Users can view their assigned numbers" ON phone_numbers;
DROP POLICY IF EXISTS "Service role manages phone numbers" ON phone_numbers;

-- SELECT: Users can view numbers assigned to their projects (or unassigned for count)
CREATE POLICY "Users can view their assigned numbers"
  ON phone_numbers FOR SELECT
  USING (
    project_id IS NULL OR
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

-- Service role handles all phone number management (assignment/release)
-- INSERT/UPDATE/DELETE handled via service role key in API routes

-- Enable Realtime for webhook_events (for live event streaming)
ALTER PUBLICATION supabase_realtime ADD TABLE webhook_events;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at on projects
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Seed phone numbers (02041-34873-10 through 02041-34873-99)
-- These are the sipgate numbers that will be auto-assigned to projects
INSERT INTO phone_numbers (phone_number, display_number)
SELECT
  '49204134873' || LPAD(num::text, 2, '0'),
  '02041-34873-' || LPAD(num::text, 2, '0')
FROM generate_series(10, 99) AS num
ON CONFLICT (phone_number) DO NOTHING;
