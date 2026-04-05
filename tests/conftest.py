import pytest


@pytest.fixture()
def client():
    """Flask test client with pythonocc mocked as unavailable."""
    import step_server
    step_server.OCC_AVAILABLE = False
    step_server.app.config["TESTING"] = True
    with step_server.app.test_client() as c:
        yield c
