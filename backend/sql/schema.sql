-- PostgreSQL schema for Finance Workflow System

CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(255)
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  hashed_password VARCHAR(255) NOT NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  manager_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  budget INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  priority INTEGER DEFAULT 3,
  status VARCHAR(50) DEFAULT 'pending',
  task_type VARCHAR(50) NOT NULL DEFAULT 'manager_assigned',
  deadline TIMESTAMP,
  project_id INTEGER REFERENCES projects(id),
  owner_id INTEGER NOT NULL REFERENCES users(id),
  created_by_id INTEGER NOT NULL REFERENCES users(id),
  daily_approved_once BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE task_history (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  changed_by INTEGER NOT NULL REFERENCES users(id),
  field VARCHAR(100) NOT NULL,
  old_value VARCHAR(255),
  new_value VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE task_reports (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  comment TEXT,
  original_filename VARCHAR(255),
  stored_filename VARCHAR(255) UNIQUE,
  file_path VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP NOT NULL,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  checklist JSON DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE process_definitions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  version INTEGER DEFAULT 1,
  published BOOLEAN DEFAULT FALSE,
  definition JSON NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE process_nodes (
  id SERIAL PRIMARY KEY,
  definition_id INTEGER NOT NULL REFERENCES process_definitions(id),
  node_id VARCHAR(100) NOT NULL,
  node_type VARCHAR(50) NOT NULL,
  label VARCHAR(255) NOT NULL,
  config JSON DEFAULT '{}'
);

CREATE TABLE process_transitions (
  id SERIAL PRIMARY KEY,
  definition_id INTEGER NOT NULL REFERENCES process_definitions(id),
  source_node VARCHAR(100) NOT NULL,
  target_node VARCHAR(100) NOT NULL,
  condition JSON DEFAULT '{}',
  priority INTEGER DEFAULT 0
);

CREATE TABLE process_instances (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL UNIQUE REFERENCES tasks(id),
  definition_id INTEGER NOT NULL REFERENCES process_definitions(id),
  current_node VARCHAR(100),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE approval_tasks (
  id SERIAL PRIMARY KEY,
  instance_id INTEGER NOT NULL REFERENCES process_instances(id),
  node_id VARCHAR(100),
  assigned_role VARCHAR(100) NOT NULL,
  assigned_user_id INTEGER REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,
  comment TEXT
);

CREATE TABLE workflow_audit_log (
  id SERIAL PRIMARY KEY,
  instance_id INTEGER NOT NULL REFERENCES process_instances(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  source_node VARCHAR(100),
  target_node VARCHAR(100),
  action VARCHAR(50) NOT NULL,
  result VARCHAR(50) NOT NULL,
  comment TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
