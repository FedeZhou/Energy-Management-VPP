"""Network helpers."""


def use_system_certificates() -> None:
    """Make Python's HTTPS use the operating system certificate store.

    CityLearn downloads datasets from GitHub on first use. On machines where
    antivirus or a corporate proxy inspects HTTPS (it re-signs traffic with its
    own root certificate), Python's bundled certificate list rejects the
    connection. The OS store trusts that root, so we defer to it. Verification
    stays fully on.
    """
    import truststore

    truststore.inject_into_ssl()
