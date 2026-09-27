/** Generated from backend/openapi.json. Run pnpm api:generate; do not edit. */
export interface paths {
  '/api/ai/providers': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['ai_http_list'];
    put?: never;
    post: operations['ai_http_create'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/ai/providers/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['ai_http_update'];
    delete: operations['ai_http_remove'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/ai/providers/{id}/models': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['ai_http_models'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['api_status'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/analyses/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['analysis_api_result'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/analyses/{id}/annotation/query': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['analysis_api_query_annotation'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/analyses/{id}/concordance/density': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['analysis_api_density_concordance'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/analyses/{id}/concordance/publish': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['analysis_api_publish_concordance'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/analyses/{id}/concordance/query': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['analysis_api_query_concordance'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/analyses/{id}/frequency/export': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['analysis_api_export'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/analyses/{id}/frequency/query': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['analysis_api_query'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/analyses/{id}/quotation/publish': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['analysis_api_publish_quotation'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/analyses/{id}/quotation/query': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['analysis_api_query_quotation'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/analyses/{id}/topic-modeling/publish': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['analysis_api_publish_topic_model'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/analyses/{id}/topic-modeling/query': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['analysis_api_query_topic_model'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/analyses/{id}/{mode}/publish': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['analysis_api_publish_plot'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/analyses/{id}/{mode}/query': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['analysis_api_query_plot'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/annotation/codebook': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['analysis_api_annotation_codebook'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/annotation/codebooks': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['analysis_api_create_codebook'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/cell-edits/{session_id}/cancel': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_cancel_cell_edit'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/cell-edits/{session_id}/page': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_cell_edit_page'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/cell-edits/{session_id}/save': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_save_cell_edit'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/close': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_close'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/create': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_create'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/embedding-models': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['analysis_api_embedding_models'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/events': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['api_task_events'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/exports': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_export_project'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/exports/inspect': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_inspect_export'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/expressions/parse': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_parse_expression'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/files/metadata': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Read recent-file sizes without opening data or acquiring a database connection. */
    post: operations['api_file_metadata'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/graph': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['api_graph'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/import': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_import_tables'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/ldaca/import': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['ldaca_import'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/ldaca/search': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['ldaca_search'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/nodes/{table_name}/cell-edit': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_begin_cell_edit_registered'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/nodes/{table_name}/clone': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_clone_node'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/nodes/{table_name}/columns': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_change_column'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/nodes/{table_name}/definition': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['api_view_definition_registered'];
    put?: never;
    post: operations['api_replace_view_definition_registered'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/nodes/{table_name}/delete': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_delete_node'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/nodes/{table_name}/edit': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_edit_registered'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/nodes/{table_name}/export': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_export_node'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/nodes/{table_name}/materialize': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_materialize_registered'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/nodes/{table_name}/page': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_node_page_registered'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/nodes/{table_name}/rename': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_rename_node'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/nodes/{table_name}/replace-source': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_replace_source'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/nodes/{table_name}/schema': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['api_node_schema_registered'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/nodes/{table_name}/undo': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_undo_registered'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/objects/{schema}/{table_name}/cell-edit': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_begin_cell_edit'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/objects/{schema}/{table_name}/clone': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_clone_node_object'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/objects/{schema}/{table_name}/columns': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_change_column_object'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/objects/{schema}/{table_name}/definition': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['api_view_definition'];
    put?: never;
    post: operations['api_replace_view_definition'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/objects/{schema}/{table_name}/delete': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_delete_node_object'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/objects/{schema}/{table_name}/edit': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_edit'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/objects/{schema}/{table_name}/export': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_export_node_object'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/objects/{schema}/{table_name}/materialize': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_materialize'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/objects/{schema}/{table_name}/page': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_node_page'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/objects/{schema}/{table_name}/rename': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_rename_node_object'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/objects/{schema}/{table_name}/replace-source': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_replace_object_source'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/objects/{schema}/{table_name}/schema': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['api_node_schema'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/objects/{schema}/{table_name}/undo': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_undo'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/open': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_open'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/samples': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['samples_catalogue'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/samples/import': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['samples_import'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/save': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_save'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/sql': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_sql'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/stopwords/prepare': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_prepare_stopwords'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/stopwords/read': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_read_stopwords'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/stopwords/save': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_save_stopwords'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/tabs': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['analysis_api_tabs'];
    put?: never;
    post: operations['analysis_api_create_tab'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/tabs/reorder': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['analysis_api_reorder_tabs'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/tabs/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['analysis_api_update_tab'];
    delete: operations['analysis_api_delete_tab'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/tabs/{id}/annotation': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['analysis_api_run_annotation'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/tabs/{id}/annotation/edit': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['analysis_api_annotation_edit'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/tabs/{id}/annotation/preview': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['analysis_api_preview_annotation'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/tabs/{id}/concordance': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['analysis_api_run_concordance'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/tabs/{id}/concordance/preview': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['analysis_api_preview_concordance'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/tabs/{id}/frequency': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['analysis_api_run_frequency'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/tabs/{id}/quotation': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['analysis_api_run_quotation'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/tabs/{id}/quotation/preview': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['analysis_api_preview_quotation'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/tabs/{id}/result': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations['analysis_api_clear_tab'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/tabs/{id}/topic-modeling': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['analysis_api_run_topic_model'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/tabs/{id}/topic-modeling/preview': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['analysis_api_preview_topic_model'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/tabs/{id}/{mode}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['analysis_api_run_plot'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/tabs/{tab}/topic-modeling/preview/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations['analysis_api_delete_topic_preview'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/tabs/{tab}/topic-modeling/preview/{id}/query': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['analysis_api_query_topic_preview'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/tasks': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['api_tasks'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/tasks/{task_id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete: operations['api_dismiss_task'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/tasks/{task_id}/cancel': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_cancel_task'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/timezones': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['analysis_api_timezones'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/tokenizers': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['analysis_api_tokenizers'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/project/views': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['api_create_view'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/resources/language/{name}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['language_asset'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/server': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['server_status'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/server/events': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['server_events'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/server/files/{library}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['server_files'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/server/files/{library}/{name}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['server_download'];
    put: operations['server_upload'];
    post?: never;
    delete: operations['server_delete'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/server/import': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['server_import'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/server/project': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['server_switch'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/server/project/save': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['server_save'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/server/project/{id}/download': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['server_snapshot'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/health/live': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['health_live'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/health/ready': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['health_ready'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    Analysis: {
      created_at: string;
      /** Format: uuid */
      id: string;
      kind: string;
      request: unknown;
      result: null | components['schemas']['AnalysisOutput'];
      /** Format: uuid */
      tab_id: string;
    };
    AnalysisOutput: {
      finished_at: string;
      payload: unknown;
      /** Format: int32 */
      version: number;
    };
    AnalysisSummary: {
      created_at: string;
      has_result: boolean;
      /** Format: uuid */
      id: string;
      request: unknown;
    };
    AnnotationExamples: {
      label: string;
      per_code: number;
      /** Format: int64 */
      seed: number;
      selection: components['schemas']['ExampleSelection'];
      source: components['schemas']['ObjectTarget'];
      text: string;
    };
    AnnotationLiveMetadata: {
      mutation_stamp: components['schemas']['MutationStamp'];
      outdated: boolean;
      row_refs: (string | null)[];
    };
    AnnotationPreviewMetadata: {
      /** Format: int64 */
      excluded_examples: number;
      has_next: boolean;
      mutation_stamp: components['schemas']['MutationStamp'];
      outdated: boolean;
      /** Format: int64 */
      page: number;
      predictions: (null | components['schemas']['Prediction'])[];
      row_refs: (string | null)[];
      skipped: number;
    };
    AnnotationPreviewRequest: {
      /** Format: int64 */
      page: number;
      /** Format: int64 */
      page_size: number;
      request: components['schemas']['AnnotationRequest'];
    };
    AnnotationQuery:
      | {
          correction?: string | null;
          /** Format: int64 */
          page: number;
          /** Format: int64 */
          page_size: number;
          review: components['schemas']['Review'];
          sorting?: components['schemas']['CellEditSort'][];
          /** @enum {string} */
          view: 'rows';
        }
      | {
          /** @enum {string} */
          view: 'context';
        }
      | {
          /** Format: int64 */
          page: number;
          /** Format: int64 */
          page_size: number;
          /** @enum {string} */
          view: 'diagnostics';
        };
    AnnotationReport: {
      /** Format: uuid */
      context: string;
      /** Format: uuid */
      diagnostics: string;
      /** Format: int64 */
      failed: number;
      /** Format: int64 */
      preserved: number;
      /** Format: int64 */
      processed: number;
      /** Format: int64 */
      skipped: number;
    };
    AnnotationRequest: {
      examples?: null | components['schemas']['AnnotationExamples'];
      inference: components['schemas']['Inference'];
      processing?: components['schemas']['Processing'];
      setup: components['schemas']['ManualSetup'];
    };
    /** Format: binary */
    Binary: string;
    /** @enum {string} */
    CastShortcut: 'string' | 'integer' | 'float' | 'datetime' | 'categorical';
    CastType:
      | components['schemas']['CastShortcut']
      | {
          sqlType: string;
        };
    CellEditColumn: {
      data_type: string;
      editable: boolean;
      identifier: boolean;
      name: string;
    };
    CellEditCompletion: {
      saved: boolean;
    };
    CellEditInsertion: {
      values: {
        [key: string]: string | null;
      };
    };
    CellEditPage: {
      /** Format: int64 */
      page: number;
      /** Format: int64 */
      page_size: number;
      review?: null | components['schemas']['Review'];
      sorting?: components['schemas']['CellEditSort'][];
    };
    CellEditPatch: {
      column: string;
      row_ref: string;
      value: string | null;
    };
    CellEditSave: {
      changes: components['schemas']['CellEditPatch'][];
      deletions?: string[];
      insertions?: components['schemas']['CellEditInsertion'][];
    };
    CellEditSort: {
      column: string;
      descending: boolean;
    };
    ChangeScope: {
      /** @default false */
      all?: boolean;
      /** @default [] */
      analysis_ids?: string[];
      /** @default [] */
      objects?: components['schemas']['Relation'][];
      /** @default [] */
      renames?: components['schemas']['ReferenceRename'][];
      /** @default [] */
      resources?: components['schemas']['Resource'][];
    };
    Code: {
      code: string;
      description: string;
    };
    Codebook: {
      code: string;
      description: string;
      source: components['schemas']['ObjectTarget'];
    };
    CodebookName: {
      name: string;
    };
    ColumnChange:
      | {
          column: string;
          /** @enum {string} */
          operation: 'add';
          sql_type: string;
        }
      | {
          column: string;
          format?: string | null;
          /** @enum {string} */
          operation: 'cast';
          target: components['schemas']['CastType'];
        }
      | {
          column: string;
          name: string;
          /** @enum {string} */
          operation: 'rename';
        }
      | {
          column: string;
          /** @enum {string} */
          operation: 'delete';
        }
      | {
          column: string;
          expression: string;
          /** @enum {string} */
          operation: 'transform';
        };
    ColumnMapping: {
      column: string;
      output: string;
      source: string;
    };
    CompareRequest: {
      category: string;
      measure: components['schemas']['Measure'];
      source: components['schemas']['ObjectTarget'];
      stack?: string | null;
      value?: string | null;
    };
    Comparison: {
      /** Format: double */
      agreement: number | null;
      /** Format: double */
      alpha: number | null;
      column: string;
      /** Format: int64 */
      excluded: number;
      /** Format: int64 */
      included: number;
      /** Format: double */
      kappa: number | null;
      matrix: components['schemas']['Confusion'][];
    };
    ConcordanceCorpus: {
      columns: [string, string][];
      /** Format: int64 */
      document_count: number;
      /** Format: uuid */
      documents: string;
      input: components['schemas']['ConcordanceInput'];
      /** Format: int64 */
      match_count: number;
      /** Format: uuid */
      matches: string;
      /** Format: int64 */
      matching_documents: number;
      /** Format: uuid */
      projection: string;
    };
    ConcordanceDensity: {
      /** Format: int32 */
      bin_count: number;
      source_index: number;
      uncased?: boolean;
    };
    ConcordanceFilter: {
      /**
       * Format: int32
       * @default 0
       */
      bin_count?: number;
      /** @default [] */
      bins?: number[];
      /** @default null */
      document_id?: string | null;
      /** @default [] */
      excluded_terms?: string[];
      /** @default false */
      uncased?: boolean;
    };
    ConcordanceInput: {
      column: string;
      source: components['schemas']['ObjectTarget'];
      tokenizer?: string | null;
    };
    ConcordancePreview: {
      input: components['schemas']['ConcordanceInput'];
      /** Format: int64 */
      page: number;
      /** Format: int64 */
      page_size: number;
      search: components['schemas']['ConcordanceSearch'];
      sort?: null | components['schemas']['DocumentSort'];
    };
    ConcordancePublish: {
      projection: components['schemas']['Projection'];
      sources: components['schemas']['PublishSource'][];
    };
    ConcordanceQuery: {
      filter?: components['schemas']['ConcordanceFilter'];
      /** Format: int64 */
      page: number;
      /** Format: int64 */
      page_size: number;
      projection?: components['schemas']['Projection'];
      sort?: null | components['schemas']['SavedSort'];
      source_index: number;
    };
    ConcordanceRequest: {
      inputs: components['schemas']['ConcordanceInput'][];
      search: components['schemas']['ConcordanceSearch'];
    };
    ConcordanceResultV1: {
      corpora: components['schemas']['ConcordanceCorpus'][];
    };
    ConcordanceSearch: {
      /** @default false */
      case_sensitive?: boolean;
      /** @default true */
      ignore_punctuation?: boolean;
      /** @default 10 */
      left_context?: number;
      /** @default text */
      mode?: components['schemas']['SearchMode'];
      /** @default  */
      query?: string;
      /** @default false */
      regex?: boolean;
      /** @default 10 */
      right_context?: number;
      /** @default true */
      whole_word?: boolean;
    };
    Confusion: {
      annotation: string;
      comparison: string;
      /** Format: int64 */
      count: number;
    };
    Connection: {
      credential_mode: components['schemas']['CredentialMode'];
      endpoint?: string | null;
      /** Format: uuid */
      id: string;
      name: string;
      provider: components['schemas']['Provider'];
      /** Format: uuid */
      revision: string;
    };
    ConnectionInfo: {
      credential_mode: components['schemas']['CredentialMode'];
      endpoint?: string | null;
      /** Format: uuid */
      id: string;
      name: string;
      provider: components['schemas']['Provider'];
      /** Format: uuid */
      revision: string;
    } & {
      built_in: boolean;
      credential_error: null | components['schemas']['Error'];
      has_credential: boolean;
    };
    Context: {
      codes: components['schemas']['Label'][];
      examples: components['schemas']['Example'][];
      /** Format: int64 */
      excluded_examples: number;
    };
    CreateConnection: {
      credential?: components['schemas']['CredentialUpdate'];
      endpoint?: string | null;
      name: string;
      provider: components['schemas']['Provider'];
    };
    CreateTab: {
      kind: string;
      name?: string | null;
    };
    CreateView: {
      computed_columns?: string[];
      mappings: components['schemas']['ColumnMapping'][];
      name: string;
      sql: string;
    };
    /** @enum {string} */
    CredentialMode: 'none' | 'session' | 'remembered';
    CredentialUpdate:
      | {
          /** @enum {string} */
          action: 'keep';
        }
      | {
          /** @enum {string} */
          action: 'session';
          key: string;
        }
      | {
          /** @enum {string} */
          action: 'remember';
          key: string;
        }
      | {
          /** @enum {string} */
          action: 'remove';
        };
    DependencyEdge: {
      source: components['schemas']['Relation'];
      target: components['schemas']['Relation'];
    };
    DependencyGraph: {
      edges: components['schemas']['DependencyEdge'][];
      nodes: components['schemas']['DependencyNode'][];
    };
    DependencyNode: {
      can_undo: boolean;
      color: string | null;
      /** Format: int64 */
      column_count: number | null;
      diagnostic?: null | components['schemas']['Error'];
      /** @enum {string} */
      kind: 'table' | 'view' | 'missing';
      object: components['schemas']['Relation'];
      registered: boolean;
      visible: boolean;
    };
    DocumentInput: {
      column: string;
      source: components['schemas']['ObjectTarget'];
    };
    DocumentSort: {
      column: string;
      descending?: boolean;
    };
    Edge: {
      dependency: boolean;
      source_name: string;
      target_name: string;
    };
    EditRequest:
      | {
          /** @enum {string} */
          mode: 'manual';
          setup: components['schemas']['ManualSetup'];
        }
      | {
          expected: components['schemas']['MutationStamp'];
          /** @enum {string} */
          mode: 'corrections';
          setup: components['schemas']['ManualSetup'];
        }
      | {
          codebook: components['schemas']['Codebook'];
          /** @enum {string} */
          mode: 'codebook';
        };
    EditViewRequest: {
      after?: components['schemas']['SqlStatement'][];
      before?: components['schemas']['SqlStatement'][];
      sql: string;
    };
    EmbeddingModel: {
      id: string;
      label: string;
      token_limit: number;
    };
    EmptyRequest: Record<string, never>;
    EmptyResponse: Record<string, never>;
    Error: {
      code: string;
      message: string;
      statement_index?: number | null;
    };
    ErrorEnvelope: {
      error: components['schemas']['Error'];
    };
    Example: {
      label: string;
      text: string;
    };
    /** @enum {string} */
    ExampleSelection: 'random' | 'first' | 'last';
    /** @enum {string} */
    Existence: 'off' | 'present' | 'empty';
    /** @enum {string} */
    ExportFormat: 'csv' | 'json' | 'ndjson' | 'parquet' | 'ipc';
    ExportInspection: {
      blockers: components['schemas']['Error'][];
      objects: components['schemas']['ExportObject'][];
      summary: components['schemas']['ExportSummary'];
    };
    ExportObject: {
      /** @enum {string} */
      action: 'copy_table' | 'write_file' | 'preserve_view' | 'materialize_view';
      /** @enum {string} */
      classification: 'data_block' | 'hidden_data_block' | 'internal';
      reason: string | null;
      source: components['schemas']['ObjectTarget'];
    };
    ExportRequest:
      | {
          format: components['schemas']['ExportFormat'];
          /** @enum {string} */
          kind: 'files';
          objects: components['schemas']['ObjectTarget'][];
        }
      | {
          /** @enum {string} */
          kind: 'selected_project';
          objects: components['schemas']['ObjectTarget'][];
        }
      | {
          /** @enum {string} */
          kind: 'complete_project';
        };
    ExportSummary: {
      /** Format: int64 */
      analyses: number;
      data_blocks: number;
      hidden_data_blocks: number;
      /** Format: int64 */
      sql_cells: number;
    };
    ExpressionSyntax:
      | {
          /** @enum {string} */
          kind: 'column';
          names: string[];
        }
      | {
          /** @enum {string} */
          kind: 'literal';
          /** @enum {string} */
          literal_type: 'text' | 'number' | 'boolean' | 'null';
          value: string;
        }
      | {
          children: components['schemas']['ParsedExpression'][];
          distinct: boolean;
          /** @enum {string} */
          kind: 'function';
          name: string;
          window: boolean;
        }
      | {
          children: components['schemas']['ParsedExpression'][];
          /** @enum {string} */
          kind: 'operator';
          name: string;
        }
      | {
          child: components['schemas']['ParsedExpression'];
          /** @enum {string} */
          kind: 'cast';
          target: string;
          try_cast: boolean;
        }
      | {
          child: components['schemas']['ParsedExpression'];
          /** @enum {string} */
          kind: 'scalar_query';
          source: string[];
        }
      | {
          /** @enum {string} */
          kind: 'sql';
        };
    FileMetadata: {
      path: string;
      /** Format: int64 */
      size_bytes: number | null;
    };
    FilePaths: {
      paths: string[];
    };
    FrequencyCorpus: {
      /** Format: uuid */
      artifact_id: string;
      color?: string | null;
      column: string;
      document_count: string;
      label: string;
      source: components['schemas']['ObjectTarget'];
      tokenizer: string;
      total_tokens: string;
      vocabulary_size: string;
    };
    /** @enum {string} */
    FrequencyExportFormat: 'csv' | 'markdown';
    FrequencyExportRequest: {
      format: components['schemas']['FrequencyExportFormat'];
      include_stopwords?: boolean;
      query: components['schemas']['FrequencyQuery'];
    };
    FrequencyInput: {
      column: string;
      source: components['schemas']['ObjectTarget'];
      tokenizer: string;
    };
    FrequencyQuery: {
      corpus_index?: number | null;
      descending?: boolean | null;
      filter?: string | null;
      limit?: number | null;
      /** Format: int64 */
      page?: number | null;
      /** Format: int64 */
      page_size?: number | null;
      sort?: string | null;
      stopword_source?: null | components['schemas']['StopwordSource'];
      view?: components['schemas']['FrequencyView'];
    };
    FrequencyRequest: {
      inputs: components['schemas']['FrequencyInput'][];
    };
    FrequencyResultV1: {
      /** Format: uuid */
      comparison_artifact_id?: string | null;
      corpora: components['schemas']['FrequencyCorpus'][];
    };
    /** @enum {string} */
    FrequencyView: 'corpus' | 'comparison' | 'juxtorpus';
    Graph: {
      edges: components['schemas']['Edge'][];
      nodes: components['schemas']['Node'][];
    };
    /** @enum {string} */
    GraphMode: 'logical' | 'dependencies';
    GraphResponse: components['schemas']['Graph'] | components['schemas']['DependencyGraph'];
    Health: {
      status: string;
      version: string;
    };
    HeatmapRequest: {
      column: string;
      measure: components['schemas']['Measure'];
      row: string;
      source: components['schemas']['ObjectTarget'];
      value?: string | null;
    };
    ImportTables: {
      sources: components['schemas']['TableImport'][];
    };
    Inference: {
      batch_size: number;
      concurrency: number;
      model: string;
      prompt: string;
      /** Format: uuid */
      provider: string;
      reasoning?: components['schemas']['Reasoning'];
      retries: number;
      /** Format: double */
      temperature?: number | null;
    };
    Interval:
      | {
          origin?: string | null;
          /** @enum {string} */
          type: 'numeric';
          width: string;
        }
      | {
          /** Format: int32 */
          step: number;
          /** @enum {string} */
          type: 'time';
          unit: components['schemas']['TimeUnit'];
        };
    Label: {
      code: string;
      description: string;
    };
    LdacaImport: {
      identifier: string;
      token?: string | null;
    };
    LdacaSearch: {
      method: components['schemas']['LdacaSearchMethod'];
      query: string;
      token?: string | null;
    };
    /** @enum {string} */
    LdacaSearchMethod: 'keyword' | 'identifier';
    /** @enum {string} */
    Library: 'data' | 'projects';
    LibraryFile: {
      /** Format: int64 */
      modified?: number | null;
      name: string;
      /** Format: int64 */
      size: number;
    };
    ManualSetup: {
      annotation: string;
      codebook?: null | components['schemas']['Codebook'];
      correction?: string | null;
      document: string;
      source: components['schemas']['ObjectTarget'];
    };
    /** @enum {string} */
    Measure: 'count' | 'sum' | 'mean' | 'median';
    MutationStamp: {
      /** Format: int64 */
      broad: number;
      /** Format: int64 */
      object: number;
    };
    Node: {
      can_undo: boolean;
      color: string | null;
      /** Format: int64 */
      column_count: number | null;
      diagnostic?: null | components['schemas']['Error'];
      document_column: string | null;
      /** @enum {string} */
      kind: 'table' | 'view' | 'missing';
      table_name: string;
      visible: boolean;
    };
    NodeExportRequest: {
      format: components['schemas']['ExportFormat'];
    };
    NodePage: {
      /** Format: int64 */
      page: number;
      /** Format: int64 */
      page_size: number;
      sorting?: components['schemas']['CellEditSort'][];
    };
    ObjectTarget: {
      /** @description Canonical name. Input also accepts the legacy `table_name` spelling. */
      name: string;
      schema?: string | null;
    };
    OpenProjectRequest: {
      path: string;
    };
    ParseExpression: {
      expression: string;
    };
    ParsedExpression: components['schemas']['ExpressionSyntax'] & {
      sql: string;
    };
    /** @enum {string} */
    PlotMode: 'trends' | 'compare' | 'scatter' | 'heatmap' | 'sankey';
    PlotPublish: {
      columns: string[];
      name: string;
      query: components['schemas']['PlotQuery'];
      selection: components['schemas']['PlotSelection'];
    };
    PlotQuery: {
      /** Format: int64 */
      minimum_rows?: number;
      uncased?: boolean;
    };
    PlotRequest:
      | components['schemas']['TrendsRequest']
      | components['schemas']['CompareRequest']
      | components['schemas']['ScatterRequest']
      | components['schemas']['HeatmapRequest']
      | components['schemas']['SankeyRequest'];
    PlotResultV1: {
      columns: [string, string][];
      document_column?: string | null;
      field_bindings?: {
        [key: string]: string;
      };
      nonnegative: boolean;
      /** Format: int64 */
      omitted_measurements: number;
      /** Format: int64 */
      row_count: number;
      /** Format: uuid */
      rows: string;
      source: components['schemas']['ObjectTarget'];
      /** Format: int64 */
      usable_rows: number;
    };
    /** @description Selection keys come from the projection, never from freshly read source positions. */
    PlotSelection: {
      cells?: string[];
      hidden?: string[];
      intervals?: string[];
      rows?: string[];
      transitions?: string[];
    };
    Prediction:
      | {
          label: string | null;
          /** @enum {string} */
          status: 'success';
        }
      | {
          error: components['schemas']['Error'];
          /** @enum {string} */
          status: 'failed';
        };
    PrepareStopwords: {
      inputs: components['schemas']['StopwordSource'][];
      selected?: null | components['schemas']['StopwordSource'];
    };
    PreviewSummary: {
      natural_topic_count: number;
      resolved_model: string;
      segment_count: number;
      sources: components['schemas']['TopicSource'][];
    };
    /** @enum {string} */
    Processing: 'all' | 'missing';
    ProjectInfo: {
      path: string | null;
      /** Format: int32 */
      schema_version: number;
      title: string;
    };
    ProjectPathRequest: {
      path?: string | null;
    };
    ProjectStatus: {
      project: null | components['schemas']['ProjectInfo'];
    };
    /** @enum {string} */
    Projection: 'matches' | 'documents';
    /** @enum {string} */
    Provider: 'openai' | 'openrouter' | 'anthropic' | 'google' | 'custom' | 'apple';
    PublishSource: {
      fields: string[];
      filter?: components['schemas']['ConcordanceFilter'];
      metadata: string[];
      name: string;
      source_index: number;
    };
    QuotationPreview: {
      input: components['schemas']['DocumentInput'];
      /** Format: int64 */
      page: number;
      /** Format: int64 */
      page_size: number;
      sort?: null | components['schemas']['DocumentSort'];
    };
    QuotationPublish: {
      fields: string[];
      metadata: string[];
      name: string;
      projection: components['schemas']['Projection'];
    };
    QuotationQuery: {
      document_id?: string | null;
      /** Format: int64 */
      page: number;
      /** Format: int64 */
      page_size: number;
      projection?: components['schemas']['Projection'];
      sort?: null | components['schemas']['SavedSort'];
    };
    QuotationRequest: {
      input: components['schemas']['DocumentInput'];
    };
    QuotationResultV1: {
      columns: [string, string][];
      /** Format: int64 */
      document_count: number;
      /** Format: uuid */
      documents: string;
      input: components['schemas']['DocumentInput'];
      /** Format: int64 */
      match_count: number;
      /** Format: uuid */
      matches: string;
      /** Format: int64 */
      matching_documents: number;
      /** Format: uuid */
      projection: string;
    };
    /** @enum {string} */
    Reasoning: 'default' | 'off' | 'low' | 'medium' | 'high';
    ReferenceRename:
      | {
          name: string;
          source: components['schemas']['Relation'];
          /** @enum {string} */
          type: 'table';
        }
      | {
          after: string;
          before: string;
          source: components['schemas']['Relation'];
          /** @enum {string} */
          type: 'column';
        };
    Relation: {
      name: string;
      schema: string;
    };
    RenameNodeRequest: {
      name: string;
    };
    ReorderTabsRequest: {
      ids: string[];
      kind: string;
    };
    ReplaceObjectSource: {
      new_source: components['schemas']['Relation'];
      old_source: components['schemas']['Relation'];
    };
    ReplaceSource: {
      new_source_name: string;
      old_source_name: string;
    };
    RepresentativeWord: {
      occurrence_count: number;
      word: string;
    };
    /** @enum {string} */
    Resource: 'graph' | 'tabs' | 'sql_cells' | 'project' | 'sql_types';
    Review: {
      changes?: components['schemas']['CellEditPatch'][];
      compare: string[];
      filter?: null | components['schemas']['RowFilter'];
    };
    ReviewSummary: {
      comparisons: components['schemas']['Comparison'][];
      /** Format: int64 */
      filtered_rows: number;
      includes_unsaved_changes: boolean;
      /** Format: int64 */
      total_rows: number;
    };
    RowFilter: {
      column: string;
      differs: boolean;
      existence: components['schemas']['Existence'];
    };
    SampleCatalogue: {
      collections: components['schemas']['SampleCollection'][];
      /** Format: int32 */
      schema_version: number;
    };
    SampleCollection: {
      description: string;
      files: components['schemas']['SampleFile'][];
      id: string;
      name: string;
      /** Format: int64 */
      total_size_bytes: number;
    };
    SampleFile: {
      path: string;
    };
    SampleImport: {
      as_views: boolean;
      file_paths: string[];
    };
    SampleImportResponse: {
      commit: string;
      table_names: string[];
    };
    SampleSnapshot: components['schemas']['SampleCatalogue'] & {
      commit: string;
    };
    Sampling:
      | {
          /** Format: int64 */
          count: number;
          /** @enum {string} */
          mode: 'count';
        }
      | {
          /** @enum {string} */
          mode: 'percentage';
          /** Format: double */
          percentage: number;
        };
    SankeyRequest: {
      measure: components['schemas']['Measure'];
      source: components['schemas']['ObjectTarget'];
      stages: string[];
      value?: string | null;
    };
    SaveStopwords: {
      after: string[];
      before: string[];
      selected: components['schemas']['StopwordSource'];
      sort?: boolean;
    };
    SavedSort: {
      descending?: boolean;
      field: string;
      metadata?: boolean;
    };
    ScatterRequest: {
      color?: string | null;
      label?: string | null;
      size?: string | null;
      source: components['schemas']['ObjectTarget'];
      x: string;
      y: string;
    };
    /** @enum {string} */
    SearchMode: 'text' | 'tokens';
    SearchResponse: {
      items: unknown[];
    };
    /** @enum {string} */
    SegmentationMethod: 'automatic' | 'line' | 'sentence';
    ServerImport: {
      name: string;
      /** Format: uuid */
      session_id: string;
    };
    ServerSave: {
      name?: string | null;
      /** Format: uuid */
      session_id: string;
    };
    ServerStatus: {
      project?: null | components['schemas']['ProjectInfo'];
      public_base_path: string;
      /** Format: uuid */
      session_id: string;
    };
    ServerSwitch: {
      discard_untitled?: boolean;
      interrupt?: boolean;
      /** @description Absent for a new Untitled project; otherwise an existing library project filename. */
      name?: string | null;
      /** Format: uuid */
      session_id: string;
    };
    SessionInfo: {
      columns: components['schemas']['CellEditColumn'][];
      mutation_stamp: components['schemas']['MutationStamp'];
      /** Format: int64 */
      row_count: number;
      schema: string;
      session_id: string;
      table_name: string;
    };
    SqlBatch: {
      changes?: null | components['schemas']['ChangeScope'];
      max_rows?: number | null;
      mode?: components['schemas']['SqlMode'];
      response?: components['schemas']['SqlResponse'];
      script?: string | null;
      statements?: components['schemas']['SqlStatement'][] | null;
    };
    SqlCommandResult: {
      statements_completed: number;
    };
    /** @enum {string} */
    SqlMode: 'execute' | 'read' | 'preview';
    SqlRequest: {
      changes?: null | components['schemas']['ChangeScope'];
      max_rows?: number | null;
      mode?: components['schemas']['SqlMode'];
      response?: components['schemas']['SqlResponse'];
      script?: string | null;
      statements?: components['schemas']['SqlStatement'][] | null;
    } & {
      task_label?: string | null;
    };
    /** @enum {string} */
    SqlResponse: 'arrow' | 'command';
    SqlStatement: {
      parameters?: unknown[];
      sql: string;
    };
    StopwordSource: {
      column: string;
      source: components['schemas']['ObjectTarget'];
    };
    Tab: {
      analysis: null | components['schemas']['AnalysisSummary'];
      /** Format: uuid */
      id: string;
      kind: string;
      name: string;
      /** Format: int64 */
      position: number;
      settings: unknown;
    };
    TableImport: {
      parameters?: unknown[];
      sql: string;
      table_name: string;
    };
    TableName: {
      table_name: string;
    };
    TableNames: {
      table_names: string[];
    };
    TaskProgress: {
      /** Format: double */
      fraction: number | null;
      message: string;
    };
    TaskSnapshot: {
      /** Format: int64 */
      revision: number;
      tasks: components['schemas']['TaskSummary'][];
    };
    /** @enum {string} */
    TaskState: 'queued' | 'running' | 'cancelling' | 'succeeded' | 'failed' | 'cancelled';
    TaskSummary: {
      /** Format: int64 */
      created_at: number;
      error: null | components['schemas']['Error'];
      /** Format: int64 */
      finished_at: number | null;
      /** Format: uuid */
      id: string;
      label: string;
      notice?: string | null;
      progress: null | components['schemas']['TaskProgress'];
      /** Format: int64 */
      started_at: number | null;
      state: components['schemas']['TaskState'];
      /** Format: uuid */
      tab_id?: string | null;
    };
    /** @enum {string} */
    TimeUnit: 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';
    TokenizerInfo: {
      label: string;
      languages: string[];
      model_id: string;
    };
    TopicDocumentQuery: {
      metadata: string[];
      /** Format: int64 */
      page: number;
      /** Format: int64 */
      page_size: number;
      source: number;
      top_n: number;
      topic: number;
      topic_count: number;
    };
    TopicInfo: {
      /** Format: int32 */
      id: number;
      representative_words: components['schemas']['RepresentativeWord'][];
      /** Format: float */
      x: number;
      /** Format: float */
      y: number;
    };
    TopicPreviewRequest: {
      request: components['schemas']['TopicRequest'];
      sampling: components['schemas']['Sampling'][];
    };
    TopicPreviewUpdate:
      | {
          /** Format: double */
          fraction: number | null;
          /** Format: uuid */
          preview_id: string;
          stage: string;
          /** @enum {string} */
          state: 'preparing';
        }
      | {
          /** Format: uuid */
          preview_id: string;
          /** @enum {string} */
          state: 'ready';
          summary: components['schemas']['PreviewSummary'];
        }
      | {
          error: components['schemas']['Error'];
          /** Format: uuid */
          preview_id: string;
          /** @enum {string} */
          state: 'failed';
        };
    TopicProjection:
      | (components['schemas']['TopicProjectionBasis'] & {
          /** @enum {string} */
          projection: 'map';
        })
      | {
          /** @enum {string} */
          projection: 'words';
          words: components['schemas']['RepresentativeWord'][][];
        };
    TopicProjectionBasis: {
      activations: [number, number, number, number][];
      has_outlier: boolean;
      topics: components['schemas']['TopicInfo'][];
    };
    TopicPublish: {
      dictionary_name: string;
      selected_topics: number[];
      sources: components['schemas']['TopicPublishSource'][];
      top_n: number;
      topic_count: number;
      /** @description Captured displayed candidates, including words beyond the cloud's visible limit. */
      words: string[][];
    };
    TopicPublishSource: {
      columns: string[];
      coverage: boolean;
      name: string;
      source: number;
    };
    TopicQuery:
      | (components['schemas']['TopicDocumentQuery'] & {
          /** @enum {string} */
          projection: 'documents';
        })
      | {
          /** @enum {string} */
          projection: 'map';
          topic_count: number;
        }
      | {
          /** @enum {string} */
          projection: 'words';
          stopword_source?: null | components['schemas']['StopwordSource'];
          topic_count: number;
        };
    TopicRequest: {
      embedding_model: string;
      inputs: components['schemas']['DocumentInput'][];
      max_segment_tokens: number;
      minimum_topic_size: number;
      /** Format: int64 */
      seed: number;
      segmentation: components['schemas']['SegmentationMethod'];
      tokenizer: string;
    };
    TopicResultV1: {
      /** Format: uuid */
      natural_projection: string;
      natural_topic_count: number;
      /** Format: uuid */
      projection_context?: string | null;
      resolved_model: string;
      segment_count: number;
      sources: components['schemas']['TopicSource'][];
    };
    TopicSource: {
      columns: [string, string][];
      document_count: number;
      /** Format: uuid */
      documents?: string | null;
      input: components['schemas']['DocumentInput'];
      /** Format: int64 */
      total_count: number;
    };
    TrendsRequest: {
      axis: string;
      groups: string[];
      interval: components['schemas']['Interval'];
      measure: components['schemas']['Measure'];
      source: components['schemas']['ObjectTarget'];
      timezone: string;
      value?: string | null;
    };
    UpdateConnection: {
      credential?: components['schemas']['CredentialUpdate'];
      name: string;
    };
    UpdateTab: {
      name?: string | null;
      settings?: unknown;
    };
    ViewDefinition: {
      sql: string;
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  ai_http_list: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ConnectionInfo'][];
        };
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  ai_http_create: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateConnection'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ConnectionInfo'];
        };
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  ai_http_update: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateConnection'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ConnectionInfo'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  ai_http_remove: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EmptyResponse'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  ai_http_models: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': string[];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_status: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectStatus'];
        };
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_result: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Analysis'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_query_annotation: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['AnnotationQuery'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Context'];
          'application/vnd.apache.arrow.stream': components['schemas']['Binary'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_density_concordance: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ConcordanceDensity'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/vnd.apache.arrow.stream': components['schemas']['Binary'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_publish_concordance: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ConcordancePublish'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          /** @description Accepted task identity */
          'x-wordflow-task-id'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Relation'][];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_query_concordance: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ConcordanceQuery'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          /** @description Document count when supplied */
          'x-wordflow-document-count'?: string;
          /** @description Whether another document page exists when supplied */
          'x-wordflow-has-next'?: string;
          /** @description Match count when supplied */
          'x-wordflow-match-count'?: string;
          /** @description Total qualifying rows when supplied */
          'x-wordflow-total-rows'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/vnd.apache.arrow.stream': components['schemas']['Binary'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_export: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['FrequencyExportRequest'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'multipart/form-data': components['schemas']['Binary'];
          'text/csv; charset=utf-8': components['schemas']['Binary'];
          'text/markdown; charset=utf-8': components['schemas']['Binary'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_query: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['FrequencyQuery'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          /** @description Total qualifying rows when supplied */
          'x-wordflow-total-rows'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/vnd.apache.arrow.stream': components['schemas']['Binary'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_publish_quotation: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['QuotationPublish'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          /** @description Accepted task identity */
          'x-wordflow-task-id'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Relation'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_query_quotation: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['QuotationQuery'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          /** @description Document count when supplied */
          'x-wordflow-document-count'?: string;
          /** @description Whether another document page exists when supplied */
          'x-wordflow-has-next'?: string;
          /** @description Match count when supplied */
          'x-wordflow-match-count'?: string;
          /** @description Total qualifying rows when supplied */
          'x-wordflow-total-rows'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/vnd.apache.arrow.stream': components['schemas']['Binary'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_publish_topic_model: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['TopicPublish'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          /** @description Accepted task identity */
          'x-wordflow-task-id'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Relation'][];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_query_topic_model: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['TopicQuery'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          /** @description Document count when supplied */
          'x-wordflow-document-count'?: string;
          /** @description Whether another document page exists when supplied */
          'x-wordflow-has-next'?: string;
          /** @description Match count when supplied */
          'x-wordflow-match-count'?: string;
          /** @description Total qualifying rows when supplied */
          'x-wordflow-total-rows'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TopicProjection'];
          'application/vnd.apache.arrow.stream': components['schemas']['Binary'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_publish_plot: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
        mode: components['schemas']['PlotMode'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PlotPublish'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          /** @description Accepted task identity */
          'x-wordflow-task-id'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Relation'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_query_plot: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
        mode: components['schemas']['PlotMode'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PlotQuery'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/vnd.apache.arrow.stream': components['schemas']['Binary'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_annotation_codebook: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['Codebook'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Code'][];
        };
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_create_codebook: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CodebookName'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Codebook'];
        };
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_cancel_cell_edit: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        session_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['EmptyRequest'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CellEditCompletion'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_cell_edit_page: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        session_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CellEditPage'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/vnd.apache.arrow.stream': components['schemas']['Binary'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_save_cell_edit: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        session_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CellEditSave'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CellEditCompletion'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_close: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['EmptyRequest'];
      };
    };
    responses: {
      /** @description Success */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_create: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ProjectPathRequest'];
      };
    };
    responses: {
      /** @description Success */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectInfo'];
        };
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_embedding_models: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EmbeddingModel'][];
        };
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_task_events: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'text/event-stream': string;
        };
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_export_project: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ExportRequest'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          /** @description Download filename when supplied */
          'Content-Disposition'?: string;
          /** @description Accepted task identity */
          'x-wordflow-task-id'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Binary'];
          'application/octet-stream': components['schemas']['Binary'];
          'application/vnd.apache.arrow.file': components['schemas']['Binary'];
          'application/vnd.apache.parquet': components['schemas']['Binary'];
          'application/x-ndjson': components['schemas']['Binary'];
          'application/zip': components['schemas']['Binary'];
          'text/csv; charset=utf-8': components['schemas']['Binary'];
        };
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_inspect_export: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ExportRequest'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ExportInspection'];
        };
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_parse_expression: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ParseExpression'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ParsedExpression'];
        };
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_file_metadata: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['FilePaths'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FileMetadata'][];
        };
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_graph: {
    parameters: {
      query?: {
        mode?: components['schemas']['GraphMode'];
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['GraphResponse'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_import_tables: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ImportTables'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          /** @description Accepted task identity */
          'x-wordflow-task-id'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TableNames'];
        };
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  ldaca_import: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['LdacaImport'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          /** @description Accepted task identity */
          'x-wordflow-task-id'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TableNames'];
        };
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  ldaca_search: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['LdacaSearch'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SearchResponse'];
        };
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_begin_cell_edit_registered: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        table_name: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['EmptyRequest'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SessionInfo'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_clone_node: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        table_name: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['EmptyRequest'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          /** @description Accepted task identity */
          'x-wordflow-task-id'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TableName'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_change_column: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        table_name: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ColumnChange'];
      };
    };
    responses: {
      /** @description Success */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_view_definition_registered: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        table_name: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ViewDefinition'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_replace_view_definition_registered: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        table_name: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ViewDefinition'];
      };
    };
    responses: {
      /** @description Success */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_delete_node: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        table_name: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['EmptyRequest'];
      };
    };
    responses: {
      /** @description Success */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_edit_registered: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        table_name: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['EditViewRequest'];
      };
    };
    responses: {
      /** @description Success */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_export_node: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        table_name: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['NodeExportRequest'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          /** @description Download filename when supplied */
          'Content-Disposition'?: string;
          /** @description Accepted task identity */
          'x-wordflow-task-id'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Binary'];
          'application/octet-stream': components['schemas']['Binary'];
          'application/vnd.apache.arrow.file': components['schemas']['Binary'];
          'application/vnd.apache.parquet': components['schemas']['Binary'];
          'application/x-ndjson': components['schemas']['Binary'];
          'application/zip': components['schemas']['Binary'];
          'text/csv; charset=utf-8': components['schemas']['Binary'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_materialize_registered: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        table_name: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['EmptyRequest'];
      };
    };
    responses: {
      /** @description Success */
      204: {
        headers: {
          /** @description Accepted task identity */
          'x-wordflow-task-id'?: string;
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_node_page_registered: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        table_name: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['NodePage'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/vnd.apache.arrow.stream': components['schemas']['Binary'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_rename_node: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        table_name: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['RenameNodeRequest'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TableName'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_replace_source: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        table_name: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ReplaceSource'];
      };
    };
    responses: {
      /** @description Success */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_node_schema_registered: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        table_name: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/vnd.apache.arrow.stream': components['schemas']['Binary'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_undo_registered: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        table_name: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['EmptyRequest'];
      };
    };
    responses: {
      /** @description Success */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_begin_cell_edit: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        schema: string;
        table_name: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['EmptyRequest'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SessionInfo'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_clone_node_object: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        schema: string;
        table_name: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['EmptyRequest'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          /** @description Accepted task identity */
          'x-wordflow-task-id'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TableName'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_change_column_object: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        schema: string;
        table_name: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ColumnChange'];
      };
    };
    responses: {
      /** @description Success */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_view_definition: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        schema: string;
        table_name: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ViewDefinition'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_replace_view_definition: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        schema: string;
        table_name: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ViewDefinition'];
      };
    };
    responses: {
      /** @description Success */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_delete_node_object: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        schema: string;
        table_name: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['EmptyRequest'];
      };
    };
    responses: {
      /** @description Success */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_edit: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        schema: string;
        table_name: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['EditViewRequest'];
      };
    };
    responses: {
      /** @description Success */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_export_node_object: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        schema: string;
        table_name: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['NodeExportRequest'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          /** @description Download filename when supplied */
          'Content-Disposition'?: string;
          /** @description Accepted task identity */
          'x-wordflow-task-id'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Binary'];
          'application/octet-stream': components['schemas']['Binary'];
          'application/vnd.apache.arrow.file': components['schemas']['Binary'];
          'application/vnd.apache.parquet': components['schemas']['Binary'];
          'application/x-ndjson': components['schemas']['Binary'];
          'application/zip': components['schemas']['Binary'];
          'text/csv; charset=utf-8': components['schemas']['Binary'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_materialize: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        schema: string;
        table_name: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['EmptyRequest'];
      };
    };
    responses: {
      /** @description Success */
      204: {
        headers: {
          /** @description Accepted task identity */
          'x-wordflow-task-id'?: string;
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_node_page: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        schema: string;
        table_name: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['NodePage'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/vnd.apache.arrow.stream': components['schemas']['Binary'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_rename_node_object: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        schema: string;
        table_name: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['RenameNodeRequest'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TableName'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_replace_object_source: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        schema: string;
        table_name: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ReplaceObjectSource'];
      };
    };
    responses: {
      /** @description Success */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_node_schema: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        schema: string;
        table_name: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/vnd.apache.arrow.stream': components['schemas']['Binary'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_undo: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        schema: string;
        table_name: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['EmptyRequest'];
      };
    };
    responses: {
      /** @description Success */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_open: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['OpenProjectRequest'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectInfo'];
        };
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  samples_catalogue: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SampleSnapshot'];
        };
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  samples_import: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SampleImport'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          /** @description Accepted task identity */
          'x-wordflow-task-id'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SampleImportResponse'];
        };
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_save: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ProjectPathRequest'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectInfo'];
        };
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_sql: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SqlRequest'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          'x-wordflow-result-truncated'?: string;
          'x-wordflow-statements-completed'?: string;
          /** @description Accepted task identity */
          'x-wordflow-task-id'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SqlCommandResult'];
          'application/vnd.apache.arrow.stream': components['schemas']['Binary'];
        };
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_prepare_stopwords: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PrepareStopwords'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['StopwordSource'];
        };
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_read_stopwords: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['StopwordSource'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': string[];
        };
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_save_stopwords: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SaveStopwords'];
      };
    };
    responses: {
      /** @description Success */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_tabs: {
    parameters: {
      query?: {
        kind?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Tab'][];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_create_tab: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateTab'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Tab'];
        };
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_reorder_tabs: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ReorderTabsRequest'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Tab'][];
        };
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_update_tab: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateTab'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Tab'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_delete_tab: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Success */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_run_annotation: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['AnnotationRequest'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          /** @description Accepted task identity */
          'x-wordflow-task-id'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Analysis'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_annotation_edit: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['EditRequest'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SessionInfo'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_preview_annotation: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['AnnotationPreviewRequest'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/vnd.apache.arrow.stream': components['schemas']['Binary'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_run_concordance: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ConcordanceRequest'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          /** @description Accepted task identity */
          'x-wordflow-task-id'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Analysis'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_preview_concordance: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ConcordancePreview'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          /** @description Document count when supplied */
          'x-wordflow-document-count'?: string;
          /** @description Whether another document page exists when supplied */
          'x-wordflow-has-next'?: string;
          /** @description Match count when supplied */
          'x-wordflow-match-count'?: string;
          /** @description Total qualifying rows when supplied */
          'x-wordflow-total-rows'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/vnd.apache.arrow.stream': components['schemas']['Binary'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_run_frequency: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['FrequencyRequest'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          /** @description Accepted task identity */
          'x-wordflow-task-id'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Analysis'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_run_quotation: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['QuotationRequest'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          /** @description Accepted task identity */
          'x-wordflow-task-id'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Analysis'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_preview_quotation: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['QuotationPreview'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          /** @description Document count when supplied */
          'x-wordflow-document-count'?: string;
          /** @description Whether another document page exists when supplied */
          'x-wordflow-has-next'?: string;
          /** @description Match count when supplied */
          'x-wordflow-match-count'?: string;
          /** @description Total qualifying rows when supplied */
          'x-wordflow-total-rows'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/vnd.apache.arrow.stream': components['schemas']['Binary'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_clear_tab: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Success */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_run_topic_model: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['TopicRequest'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          /** @description Accepted task identity */
          'x-wordflow-task-id'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Analysis'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_preview_topic_model: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['TopicPreviewRequest'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'text/event-stream': string;
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_run_plot: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
        mode: components['schemas']['PlotMode'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PlotRequest'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          /** @description Accepted task identity */
          'x-wordflow-task-id'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Analysis'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          /** @description Accepted task identity, including task failures */
          'x-wordflow-task-id'?: string | null;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_delete_topic_preview: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        tab: string;
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Success */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_query_topic_preview: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        tab: string;
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['TopicQuery'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          /** @description Document count when supplied */
          'x-wordflow-document-count'?: string;
          /** @description Whether another document page exists when supplied */
          'x-wordflow-has-next'?: string;
          /** @description Match count when supplied */
          'x-wordflow-match-count'?: string;
          /** @description Total qualifying rows when supplied */
          'x-wordflow-total-rows'?: string;
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TopicProjection'];
          'application/vnd.apache.arrow.stream': components['schemas']['Binary'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_tasks: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TaskSnapshot'];
        };
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_dismiss_task: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        task_id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TaskSnapshot'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_cancel_task: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        task_id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['EmptyRequest'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TaskSnapshot'];
        };
      };
      /** @description Invalid request, extractor rejection or operation failure */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
          'text/plain; charset=utf-8': string;
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_timezones: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': string[];
        };
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  analysis_api_tokenizers: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TokenizerInfo'][];
        };
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  api_create_view: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateView'];
      };
    };
    responses: {
      /** @description Success */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TableName'];
        };
      };
      /** @description Invalid request or operation failed */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Origin not allowed */
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Resource unavailable */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Operation conflict */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Internal operation error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      /** @description Backend stopping */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  language_asset: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        name: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Pinned model or WASM runtime asset */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/octet-stream': components['schemas']['Binary'];
          'application/wasm': components['schemas']['Binary'];
          'text/javascript': string;
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  server_status: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ServerStatus'];
        };
      };
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  server_events: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Active project session identifiers as SSE data */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'text/event-stream': string;
        };
      };
    };
  };
  server_files: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        library: components['schemas']['Library'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['LibraryFile'][];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  server_download: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        library: components['schemas']['Library'];
        name: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/octet-stream': components['schemas']['Binary'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  server_upload: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        library: components['schemas']['Library'];
        name: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/octet-stream': components['schemas']['Binary'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['LibraryFile'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  server_delete: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        library: components['schemas']['Library'];
        name: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Deleted */
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  server_import: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ServerImport'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TableNames'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  server_switch: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ServerSwitch'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ServerStatus'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  server_save: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ServerSave'];
      };
    };
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ServerStatus'];
        };
      };
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  server_snapshot: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/octet-stream': components['schemas']['Binary'];
        };
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  health_live: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Health'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
    };
  };
  health_ready: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Health'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorEnvelope'];
        };
      };
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['Health'];
        };
      };
    };
  };
}
