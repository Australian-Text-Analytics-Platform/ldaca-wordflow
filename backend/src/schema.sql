CREATE SCHEMA wordflow;
CREATE SCHEMA data;
CREATE TABLE wordflow.project (
    singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
    schema_version INTEGER NOT NULL CHECK (schema_version = 1),
    description VARCHAR NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp
);
CREATE TABLE wordflow.nodes (
    table_name VARCHAR PRIMARY KEY,
    visible BOOLEAN NOT NULL DEFAULT true,
    color VARCHAR,
    document_column VARCHAR
);
CREATE UNIQUE INDEX node_identifier ON wordflow.nodes (translate(table_name,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'));
CREATE TABLE wordflow.edges (
    source_name VARCHAR NOT NULL,
    target_name VARCHAR NOT NULL,
    PRIMARY KEY (source_name, target_name),
    CHECK (source_name <> target_name)
);
CREATE TABLE wordflow.arrow_metadata (
    schema_name VARCHAR NOT NULL,
    relation_name VARCHAR NOT NULL,
    field_path VARCHAR NOT NULL,
    extension_name VARCHAR NOT NULL,
    extension_metadata VARCHAR,
    CHECK (json_valid(field_path) AND json_type(field_path) = 'ARRAY' AND json_array_length(field_path) > 0),
    PRIMARY KEY (schema_name, relation_name, field_path)
);
CREATE TABLE wordflow.tokenizer_models (
    table_name VARCHAR NOT NULL,
    column_name VARCHAR NOT NULL,
    tokenizer_model VARCHAR NOT NULL,
    PRIMARY KEY (table_name, column_name)
);
CREATE TABLE wordflow.tabs (
    id UUID PRIMARY KEY,
    kind VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    position BIGINT NOT NULL,
    settings JSON NOT NULL DEFAULT '{}'
);
CREATE TABLE wordflow.analyses (
    id UUID PRIMARY KEY DEFAULT uuid(),
    tab_id UUID NOT NULL UNIQUE,
    request JSON NOT NULL,
    result JSON,
    result_version INTEGER CHECK (result_version > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT current_timestamp,
    finished_at TIMESTAMPTZ,
    CHECK ((result IS NULL AND result_version IS NULL AND finished_at IS NULL)
        OR (result IS NOT NULL AND result_version IS NOT NULL AND finished_at IS NOT NULL))
);
CREATE TABLE wordflow.artifacts (
    id UUID PRIMARY KEY DEFAULT uuid(),
    analysis_id UUID NOT NULL,
    name VARCHAR NOT NULL,
    -- Tabular storage names a private Table or View; cleanup resolves its catalogue kind.
    storage_kind VARCHAR NOT NULL CHECK (storage_kind IN ('relation','blob')),
    media_type VARCHAR,
    relation_name VARCHAR,
    content BLOB,
    CHECK ((storage_kind='relation' AND relation_name IS NOT NULL AND content IS NULL AND media_type IS NULL)
        OR (storage_kind='blob' AND relation_name IS NULL AND content IS NOT NULL AND media_type IS NOT NULL)),
    UNIQUE (analysis_id, name)
);

CREATE TABLE wordflow.sql_cells (
    id UUID PRIMARY KEY,
    position BIGINT NOT NULL,
    sql VARCHAR NOT NULL DEFAULT '',
    mode VARCHAR NOT NULL DEFAULT 'default' CHECK (mode IN ('default', 'live'))
);
