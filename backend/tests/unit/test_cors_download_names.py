"""Pages on another origin can read download names (issue 393).

The desktop app's page and the dev server are on a different origin from the
backend; without Content-Disposition exposed they can't read a download's
name and saved a multi-source ZIP under the first table's CSV name.
"""


def test_cors_exposes_the_download_name(files_test_client):
    response = files_test_client.get("/health/live", headers={"Origin": "http://testserver"})

    exposed = response.headers.get("access-control-expose-headers", "")
    assert "content-disposition" in exposed.casefold()
