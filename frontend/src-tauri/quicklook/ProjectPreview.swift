import CDuckDB
import Foundation

struct PreviewColumn: Codable {
    let name: String
    let type: String
}

struct PreviewNode: Codable {
    let table_name: String
    let color: String?
    let kind: String?
    let column_count: Int?
    let columns: [PreviewColumn]
}

struct ProjectPreview: Codable {
    let filename: String
    var file_size: String?
    var modified: String?
    var description = ""
    var nodes: [PreviewNode] = []
    var saved_sql_cells: Int?
    var message: String?

    static func read(_ url: URL) -> ProjectPreview {
        var preview = ProjectPreview(filename: url.lastPathComponent)
        if let values = try? url.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey]) {
            if let size = values.fileSize {
                preview.file_size = ByteCountFormatter.string(fromByteCount: Int64(size), countStyle: .file)
            }
            if let modified = values.contentModificationDate {
                preview.modified = DateFormatter.localizedString(from: modified, dateStyle: .medium, timeStyle: .short)
            }
        }
        do {
            try preview.readMetadata(url)
        } catch let error as PreviewFailure {
            preview.message = error.message
        } catch {
            preview.message = PreviewFailure.unreadable.message
        }
        return preview
    }

    private mutating func readMetadata(_ url: URL) throws {
        // Release the catalogue snapshot and connection before returning HTML to Quick Look.
        let database = try PreviewDatabase(url)
        _ = try database.query("BEGIN TRANSACTION READ ONLY")
        let tables = try database.query("""
            SELECT table_name FROM duckdb_tables()
            WHERE database_name=current_database() AND schema_name='wordflow'
            """).compactMap { $0[0] }
        let required: Set<String> = ["project", "nodes", "edges", "arrow_metadata", "tokenizer_models", "tabs", "analyses", "artifacts", "sql_cells"]
        guard required.isSubset(of: Set(tables)) else { throw PreviewFailure.unsupported }
        // Validate required columns before rendering; do not evaluate user Views.
        let shapes = [
            "SELECT singleton,schema_version,description,created_at FROM wordflow.project LIMIT 0",
            "SELECT table_name,visible,color,document_column FROM wordflow.nodes LIMIT 0",
            "SELECT source_name,target_name FROM wordflow.edges LIMIT 0",
            "SELECT schema_name,relation_name,field_path,extension_name,extension_metadata FROM wordflow.arrow_metadata LIMIT 0",
            "SELECT table_name,column_name,tokenizer_model FROM wordflow.tokenizer_models LIMIT 0",
            "SELECT id,kind,name,position,settings FROM wordflow.tabs LIMIT 0",
            "SELECT id,tab_id,request,result,result_version,created_at,finished_at FROM wordflow.analyses LIMIT 0",
            "SELECT id,analysis_id,name,storage_kind,relation_name,content,media_type FROM wordflow.artifacts LIMIT 0",
            "SELECT id,position,sql,mode FROM wordflow.sql_cells LIMIT 0",
        ]
        do {
            for sql in shapes { _ = try database.query(sql) }
        } catch { throw PreviewFailure.unsupported }
        let schemas = try database.query("SELECT schema_name FROM duckdb_schemas() WHERE database_name=current_database() AND schema_name='data'")
        guard schemas.count == 1 else { throw PreviewFailure.unsupported }
        let project = try database.query("SELECT schema_version,description FROM wordflow.project")
        guard project.count == 1, project[0][0] == "1" else { throw PreviewFailure.unsupported }

        // Stored catalogue fields remain inspectable when a View cannot be evaluated.
        let rows = try database.query("""
            WITH objects AS (
                SELECT table_name,'Table' AS kind,column_count FROM duckdb_tables()
                WHERE database_name=current_database() AND schema_name='data'
                UNION ALL
                SELECT view_name,'View',column_count FROM duckdb_views()
                WHERE database_name=current_database() AND schema_name='data'
            )
            SELECT n.table_name,n.color,o.kind,o.column_count
            FROM wordflow.nodes n LEFT JOIN objects o
              ON translate(n.table_name,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')
                 =translate(o.table_name,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')
            WHERE n.visible ORDER BY lower(n.table_name),n.table_name
            """)
        let fields = try database.query("""
            SELECT n.table_name,c.column_name,c.data_type FROM wordflow.nodes n
            JOIN duckdb_columns() c
              ON translate(n.table_name,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')
                 =translate(c.table_name,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')
            WHERE n.visible AND c.database_name=current_database() AND c.schema_name='data'
            ORDER BY n.table_name,c.column_index
            """)
        var columns: [String: [PreviewColumn]] = [:]
        for field in fields {
            guard let table = field[0], let name = field[1], let type = field[2] else { throw PreviewFailure.unreadable }
            columns[table, default: []].append(PreviewColumn(name: name, type: type))
        }
        let nodes = try rows.map { row -> PreviewNode in
            guard let name = row[0] else { throw PreviewFailure.unreadable }
            return PreviewNode(table_name: name, color: row[1], kind: row[2],
                column_count: row[3].flatMap(Int.init), columns: columns[name] ?? [])
        }
        let cells = try database.query("SELECT count(*) FROM wordflow.sql_cells")
        guard let count = cells.first?.first.flatMap({ $0 }).flatMap(Int.init) else { throw PreviewFailure.unreadable }
        _ = try database.query("COMMIT")
        self.description = project[0][1] ?? ""
        self.nodes = nodes
        self.saved_sql_cells = count
    }
}

private enum PreviewFailure: Error {
    case inUse, unsupported, unreadable

    var message: String {
        switch self {
        case .inUse: return "Project is currently in use."
        case .unsupported: return "This file is not a supported Wordflow project."
        case .unreadable: return "Unable to read this project. Open it in Wordflow for details."
        }
    }
}

private final class PreviewDatabase {
    private var database: duckdb_database?
    private var connection: duckdb_connection?

    init(_ url: URL) throws {
        var config: duckdb_config?
        guard duckdb_create_config(&config) == DuckDBSuccess else { throw PreviewFailure.unreadable }
        defer { duckdb_destroy_config(&config) }
        for (key, value) in [
            "access_mode": "READ_ONLY",
            "enable_external_access": "false",
            "autoload_known_extensions": "false",
            "autoinstall_known_extensions": "false",
            "threads": "1",
        ] {
            guard duckdb_set_config(config, key, value) == DuckDBSuccess else { throw PreviewFailure.unreadable }
        }
        var error: UnsafeMutablePointer<CChar>?
        let state = duckdb_open_ext(url.path, &database, config, &error)
        let detail = error.map { String(cString: $0) } ?? ""
        duckdb_free(error)
        guard state == DuckDBSuccess else {
            duckdb_close(&database)
            if detail.contains("Could not set lock") || detail.contains("Conflicting lock") {
                throw PreviewFailure.inUse
            }
            throw PreviewFailure.unreadable
        }
        guard duckdb_connect(database, &connection) == DuckDBSuccess else {
            duckdb_close(&database)
            throw PreviewFailure.unreadable
        }
    }

    deinit {
        duckdb_disconnect(&connection)
        duckdb_close(&database)
    }

    func query(_ sql: String) throws -> [[String?]] {
        var result = duckdb_result()
        defer { duckdb_destroy_result(&result) }
        guard duckdb_query(connection, sql, &result) == DuckDBSuccess else { throw PreviewFailure.unreadable }
        return (0..<duckdb_row_count(&result)).map { row in
            (0..<duckdb_column_count(&result)).map { column in
                guard !duckdb_value_is_null(&result, column, row),
                      let value = duckdb_value_varchar(&result, column, row) else { return nil }
                defer { duckdb_free(value) }
                return String(cString: value)
            }
        }
    }
}
