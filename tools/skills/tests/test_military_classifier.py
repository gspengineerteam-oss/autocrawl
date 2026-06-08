from tools.skills.military_classifier import classify, reload_taxonomy


def setup_function(_):
    reload_taxonomy()


def test_weapon_manufacturer_positive():
    r = classify("PT Pindad — small arms and ammunition manufacturer")
    assert r.is_military is True
    assert r.score > 0
    assert "weapons" in r.matched_categories or "ammunition" in r.matched_categories


def test_armored_vehicle_positive():
    r = classify(["Acme Defense", "main battle tank, armored personnel carrier, radar"])
    assert r.is_military is True
    assert {"vehicles_armor", "c4isr_electronics"}.issubset(set(r.matched_categories))


def test_cosmetics_negative():
    r = classify("Lipstick and skincare cosmetics brand")
    assert r.is_military is False
    assert r.score == 0.0
    assert r.matched_categories == ()


def test_drone_positive():
    # Snowglobe 2026-05-25 — weak single-category hit now needs explicit
    # military context. Updated text adds "military" prefix to mirror real
    # defense vendor descriptions.
    r = classify("military UAV manufacturer specialized in surveillance and counter drone systems")
    assert r.is_military is True
    assert "c4isr_electronics" in r.matched_categories


def test_empty_input():
    r = classify("")
    assert r.is_military is False
    assert r.score == 0.0


def test_score_increases_with_more_categories():
    r1 = classify("rifle")
    r2 = classify("rifle ammunition missile tank radar body armor")
    assert r2.score > r1.score


def test_to_dict_shape():
    r = classify("missile defense system")
    d = r.to_dict()
    assert {"is_military", "score", "matched_categories", "matched_keywords"}.issubset(d.keys())
    assert isinstance(d["score"], float)


# Snowglobe 2026-05-25 — word-boundary + negative context regression cases.

def test_thanks_does_not_match_tank():
    r = classify("thanks for visiting our showroom")
    assert r.is_military is False, "word-boundary must stop 'thanks' from matching 'tank'"


def test_racing_drone_negative_context_excludes_c4isr():
    r = classify("drone racing championship hobby brand")
    assert r.is_military is False


def test_global_negative_cosmetic_aborts():
    r = classify("cosmetic and skincare retail")
    assert r.is_military is False
    assert (r.rejected_by or "").startswith("global_negative")


def test_commercial_airline_excludes_aerospace_military():
    r = classify("commercial airline mro maintenance services with combat-ready slogans")
    assert r.is_military is False


def test_water_tank_excludes_vehicles_armor():
    r = classify("water tank manufacturer for civilian use")
    assert r.is_military is False


def test_weak_signal_demoted_without_explicit_military():
    r = classify("lone drone for delivery service")
    assert r.is_military is False
    assert r.rejected_by == "weak_signal_no_explicit_military_context"


def test_weak_signal_passes_with_explicit_military():
    r = classify("military drone surveillance platform")
    assert r.is_military is True


def test_plural_weapons_matches():
    r = classify("combat ready weapons manufacturer")
    assert r.is_military is True


def test_real_defense_vendor_multi_category():
    r = classify("manufacturer of main battle tank, missile launcher, military radar")
    assert r.is_military is True
    assert len(r.matched_categories) >= 2
