def test_admin_can_save_google_sheet_runtime_settings(client, auth_headers):
    update_response = client.put(
        "/system/runtime-config",
        headers=auth_headers,
        json={
            "GOOGLE_SERVICE_ACCOUNT_EMAIL": "service-account@example.iam.gserviceaccount.com",
            "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY": "-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----",
        },
    )

    assert update_response.status_code == 200
    payload = update_response.json()
    assert "GOOGLE_SERVICE_ACCOUNT_EMAIL" in payload["changed_keys"]
    assert "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY" in payload["changed_keys"]
    assert payload["settings"]["GOOGLE_SERVICE_ACCOUNT_EMAIL"]["value"] == "service-account@example.iam.gserviceaccount.com"
    assert payload["settings"]["GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"]["is_configured"] is True
    assert payload["settings"]["GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"]["display_value"]
