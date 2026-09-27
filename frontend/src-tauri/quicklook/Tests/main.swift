import CDuckDB
import Foundation

func withDatabase(_ path: String, _ body: (duckdb_connection?) throws -> Void) throws {
    var database: duckdb_database?
    var connection: duckdb_connection?
    precondition(duckdb_open(path, &database) == DuckDBSuccess)
    defer { duckdb_disconnect(&connection); duckdb_close(&database) }
    precondition(duckdb_connect(database, &connection) == DuckDBSuccess)
    try body(connection)
}

func execute(_ connection: duckdb_connection?, _ sql: String) {
    var result = duckdb_result()
    defer { duckdb_destroy_result(&result) }
    let status = duckdb_query(connection, sql, &result)
    precondition(status == DuckDBSuccess, duckdb_result_error(&result).map { String(cString: $0) } ?? sql)
}

if CommandLine.arguments[1] == "--hold" {
    try withDatabase(CommandLine.arguments[2]) { _ in
        FileHandle.standardOutput.write(Data("ready\n".utf8))
        _ = FileHandle.standardInput.readData(ofLength: 1)
    }
} else {
    let fileManager = FileManager.default
    let directory = fileManager.temporaryDirectory.appendingPathComponent("wordflow-preview-tests-\(UUID().uuidString)")
    try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? fileManager.removeItem(at: directory) }
    let schema = try String(contentsOfFile: CommandLine.arguments[1], encoding: .utf8)
    let renderer = URL(fileURLWithPath: CommandLine.arguments[2])
    let path = directory.appendingPathComponent("Graph.wfpj")
    let parquet = directory.appendingPathComponent("source.parquet")
    try withDatabase(path.path) { connection in
        execute(connection, schema)
        execute(connection, """
            INSERT INTO wordflow.project(schema_version,description) VALUES (1,'A test graph');
            CREATE TABLE data.example AS SELECT 1 AS a, 'value' AS b;
            CREATE VIEW data.broken AS SELECT b FROM data.example;
            COPY data.example TO '\(parquet.path)' (FORMAT PARQUET);
            CREATE VIEW data.offline AS SELECT * FROM read_parquet('\(parquet.path)');
            ALTER TABLE data.example DROP COLUMN b;
            INSERT INTO wordflow.nodes(table_name,color) VALUES ('example','#AABBCC'),('broken',NULL),('offline',NULL),('missing',NULL);
            INSERT INTO wordflow.nodes(table_name,visible) VALUES ('hidden',false);
            INSERT INTO wordflow.edges(source_name,target_name) VALUES ('example','broken'),('example','offline'),('hidden','example');
            INSERT INTO wordflow.sql_cells(id,position,sql) VALUES (uuid(),0,'SELECT 1'),(uuid(),1,'SELECT 2');
            CREATE TABLE data.unregistered AS SELECT 5 AS private;
            CREATE TABLE wordflow.result_test AS SELECT 'private analysis token' AS token, 10::UBIGINT AS count;
            CHECKPOINT;
            """)
    }
    try fileManager.removeItem(at: parquet)
    let original = try Data(contentsOf: path)
    let modified = try fileManager.attributesOfItem(atPath: path.path)[.modificationDate] as! Date
    for _ in 0..<3 {
        let preview = ProjectPreview.read(path)
        precondition(preview.message == nil)
        precondition(preview.nodes.map(\.table_name) == ["broken", "example", "missing", "offline"])
        precondition(preview.description == "A test graph" && preview.nodes.count == 4)
        precondition(preview.nodes.first { $0.table_name == "example" }?.column_count == 1)
        precondition(preview.nodes.first { $0.table_name == "example" }?.color == "#AABBCC")
        precondition(preview.nodes.first { $0.table_name == "broken" }?.column_count == 1)
        precondition(preview.nodes.first { $0.table_name == "offline" }?.column_count == 2)
        precondition(preview.nodes.first { $0.table_name == "offline" }?.kind == "View")
        precondition(preview.nodes.first { $0.table_name == "missing" }?.kind == nil)
        precondition(preview.nodes.first { $0.table_name == "offline" }?.columns.map(\.name) == ["a", "b"])
        precondition(preview.nodes.first { $0.table_name == "offline" }?.columns.map(\.type) == ["INTEGER", "VARCHAR"])
        precondition(preview.nodes.first { $0.table_name == "missing" }?.columns.isEmpty == true)
        precondition(preview.saved_sql_cells == 2 && preview.file_size != nil && preview.modified != nil)
        let html = try PreviewRenderer.render(preview, scriptURL: renderer)
        precondition(html.contains("2 columns") && html.contains("Object unavailable"))
        precondition(!html.contains("Rows:") && !html.contains("<script") && !html.contains("<canvas") && html.contains("<details>"))
        precondition(!html.contains("private analysis token") && !html.contains("result_test"))
    }
    let after = try Data(contentsOf: path)
    let modifiedAfter = try fileManager.attributesOfItem(atPath: path.path)[.modificationDate] as! Date
    precondition(after == original && modifiedAfter == modified)
    // A separate writer proves the preview has released its file descriptor and lock.
    let holder = Process()
    let input = Pipe(), output = Pipe()
    holder.executableURL = URL(fileURLWithPath: CommandLine.arguments[0])
    holder.arguments = ["--hold", path.path]
    holder.standardInput = input
    holder.standardOutput = output
    try holder.run()
    precondition(output.fileHandleForReading.readData(ofLength: 6) == Data("ready\n".utf8))
    let inUse = ProjectPreview.read(path)
    precondition(inUse.message == "Project is currently in use.")
    precondition(inUse.file_size != nil && inUse.modified != nil && inUse.saved_sql_cells == nil)
    input.fileHandleForWriting.write(Data([0]))
    holder.waitUntilExit()
    precondition(holder.terminationStatus == 0 && ProjectPreview.read(path).message == nil)

    let moved = directory.appendingPathComponent("Moved.wfpj")
    try fileManager.moveItem(at: path, to: moved)
    precondition(ProjectPreview.read(moved).filename == "Moved.wfpj")
    let empty = directory.appendingPathComponent("Empty.wfpj")
    try withDatabase(empty.path) { connection in
        execute(connection, schema)
        execute(connection, "INSERT INTO wordflow.project(schema_version) VALUES (1)")
    }
    precondition(ProjectPreview.read(empty).nodes.isEmpty && ProjectPreview.read(empty).message == nil)
    let old = directory.appendingPathComponent("Old.wfpj")
    try withDatabase(old.path) { connection in
        execute(connection, schema.replacingOccurrences(of: "schema_version = 1", with: "schema_version = 6"))
        execute(connection, "INSERT INTO wordflow.project(schema_version) VALUES (6)")
    }
    precondition(ProjectPreview.read(old).message == "This file is not a supported Wordflow project.")
    let legacy = directory.appendingPathComponent("Legacy.wfpj")
    try withDatabase(legacy.path) { connection in
        execute(connection, schema.replacingOccurrences(of: "schema_version", with: "format_version"))
        execute(connection, "INSERT INTO wordflow.project(format_version) VALUES (1)")
    }
    let legacyBytes = try Data(contentsOf: legacy)
    precondition(ProjectPreview.read(legacy).message == "This file is not a supported Wordflow project.")
    let legacyAfter = try Data(contentsOf: legacy)
    precondition(legacyAfter == legacyBytes)
    let incomplete = directory.appendingPathComponent("Incomplete.wfpj")
    try withDatabase(incomplete.path) { connection in
        execute(connection, schema)
        execute(connection, "INSERT INTO wordflow.project(schema_version) VALUES (1); DROP TABLE wordflow.tabs")
    }
    precondition(ProjectPreview.read(incomplete).message == "This file is not a supported Wordflow project.")
    let foreign = directory.appendingPathComponent("Other.wfpj")
    try withDatabase(foreign.path) { connection in execute(connection, "CREATE TABLE other (x INT)") }
    precondition(ProjectPreview.read(foreign).message == "This file is not a supported Wordflow project.")
    let damaged = directory.appendingPathComponent("Damaged.wfpj")
    try Data("not a database".utf8).write(to: damaged)
    precondition(ProjectPreview.read(damaged).message?.hasPrefix("Unable to read") == true)
    let missing = directory.appendingPathComponent("Absent.wfpj")
    precondition(ProjectPreview.read(missing).message != nil && !fileManager.fileExists(atPath: missing.path))
    // Native localized file details survive unsupported and unreadable content too.
    precondition(ProjectPreview.read(old).file_size != nil && ProjectPreview.read(damaged).modified != nil)
    print("Quick Look native checks passed: offline catalogue, missing objects, rendering, read-only integrity, lock release, in-use state, relocation, empty/unsupported/damaged files.")
}
