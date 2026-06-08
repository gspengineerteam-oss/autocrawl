from tools.skills.contact_extractor import extract


def test_simple_email():
    r = extract("Contact us: hello@acme.com for sales")
    assert "hello@acme.com" in r.emails
    assert r.has_email is True


def test_obfuscated_email():
    r = extract("Email: support [at] example [dot] com")
    assert "support@example.com" in r.emails


def test_id_phone_plus62():
    r = extract("Call +62 21 1234 5678")
    assert any(p.startswith("+62") for p in r.phones)


def test_local_id_phone():
    r = extract("Hubungi 021-345-6789 untuk info")
    assert any("3456789" in p for p in r.phones)


def test_international_phone():
    r = extract("Tel: +1 (415) 555-9876")
    assert any("+1" in p for p in r.phones)


def test_reject_garbage_phone():
    r = extract("ref 11111111 and 00000000")
    assert r.phones == ()


def test_strips_html():
    r = extract("<p>Email: <a href='mailto:x@y.com'>x@y.com</a></p>")
    assert "x@y.com" in r.emails


def test_dedup_emails_and_phones():
    r = extract("a@b.com a@b.com +62 21 111 2222 +62 21 111 2222")
    assert r.emails == ("a@b.com",)
    assert len(r.phones) == 1


def test_empty_input():
    r = extract("")
    assert r.emails == ()
    assert r.phones == ()
    assert r.contact_count == 0


def test_to_dict_shape():
    r = extract("hello@a.com +62 21 999 8888")
    d = r.to_dict()
    assert set(d.keys()) == {"emails", "phones", "has_email", "has_phone", "contact_count"}
    assert d["contact_count"] == 2
