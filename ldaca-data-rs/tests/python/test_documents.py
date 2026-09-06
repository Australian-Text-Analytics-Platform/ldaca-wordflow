from ldaca_data_rs import RoCrate


def test_select_text_documents_prefers_plain_text_derivatives() -> None:
    metadata = {
        "@graph": [
            {
                "@id": "arcp://name,example/work/1",
                "@type": "CreativeWork",
                "name": "Document 1",
                "dateCreated": "1788",
            },
            {
                "@id": "https://data.ldaca.edu.au/api/stream?path=data%2F1.txt",
                "@type": ["File"],
                "name": "Document 1 with codes",
                "encodingFormat": ["text/plain"],
                "contentSize": "20",
                "ldac:annotationOf": {"@id": "arcp://name,example/work/1"},
            },
            {
                "@id": ("https://data.ldaca.edu.au/api/stream?path=data%2F1-plain.txt"),
                "@type": ["File"],
                "name": "Document 1 plain",
                "encodingFormat": ["text/plain"],
                "contentSize": "18",
                "ldac:annotationOf": {"@id": "arcp://name,example/work/1"},
            },
        ]
    }

    assert RoCrate(metadata).text_documents() == [
        {
            "file_id": ("https://data.ldaca.edu.au/api/stream?path=data%2F1-plain.txt"),
            "path": "data/1-plain.txt",
            "name": "Document 1 plain",
            "encoding_format": "text/plain",
            "content_size": 18,
            "annotation_of": "arcp://name,example/work/1",
            "work_name": "Document 1",
            "date_created": "1788",
        }
    ]


def test_invalid_declared_sizes_are_not_trusted():
    for value in ("invalid", "-1"):
        documents = RoCrate(
            {
                "@graph": [
                    {
                        "@id": "data/file.txt",
                        "@type": "File",
                        "encodingFormat": "text/plain",
                        "contentSize": value,
                    }
                ]
            }
        ).text_documents()
        assert documents[0]["content_size"] is None
