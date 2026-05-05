"""
Test suite for Vietnamese plate validator.
Run: python test_validator.py
"""

from vn_plate_validator import (
    parse_vietnamese_plate,
    format_plate,
    merge_two_line_plate,
    clean_raw_text,
    correct_character,
    get_province_name,
)


def test_standard_plates():
    """Test standard personal plates."""
    cases = [
        # (input, expected_formatted, expected_type)
        ("30A12345", "30A-123.45", "personal"),
        ("51F23456", "51F-234.56", "personal"),
        ("29B11234", "29B-112.34", "personal"),  # Ambiguous: 29B-11234 or 29B1-1234, prefers 5-digit
        ("43A00001", "43A-000.01", "government"),
        ("80A12345", "80A-123.45", "government"),
        ("36C56789", "36C-567.89", "personal"),
        ("59A12345", "59A-123.45", "personal"),
        ("15A1234", "15A-12.34", "personal"),
    ]

    print("=== Standard Plate Tests ===")
    passed = 0
    for raw, expected_fmt, expected_type in cases:
        result = parse_vietnamese_plate(raw)
        if result is None:
            print(f"  FAIL: {raw} -> None (expected {expected_fmt})")
            continue
        if result['formatted'] == expected_fmt and result['plate_type'] == expected_type:
            print(f"  PASS: {raw} -> {result['formatted']} ({result['plate_type']})")
            passed += 1
        else:
            print(f"  FAIL: {raw} -> {result['formatted']} ({result['plate_type']}) (expected {expected_fmt}, {expected_type})")

    print(f"  Result: {passed}/{len(cases)} passed\n")
    return passed, len(cases)


def test_ocr_corrections():
    """Test position-aware OCR character correction."""
    cases = [
        # OCR misreads digits as letters in province code
        ("3OA12345", "30A-123.45"),    # O -> 0 in digit position
        ("5IF23456", "51F-234.56"),     # I -> 1 in digit position
        # OCR misreads letters as digits in series
        ("300-12345", "30O-123.45"),    # 0 -> O in letter position (after valid correction)
        # Combined errors
        ("3OAI2345", "30A-123.45"),     # O->0, I->1 (I is in digit position)
    ]

    print("=== OCR Correction Tests ===")
    passed = 0
    for raw, expected in cases:
        result = parse_vietnamese_plate(raw)
        if result and result['formatted'] == expected:
            print(f"  PASS: {raw} -> {result['formatted']}")
            passed += 1
        else:
            got = result['formatted'] if result else "None"
            print(f"  FAIL: {raw} -> {got} (expected {expected})")

    print(f"  Result: {passed}/{len(cases)} passed\n")
    return passed, len(cases)


def test_two_line_plates():
    """Test two-line motorcycle plates."""
    cases = [
        # (line1, line2, expected_formatted)
        ("29B1", "23456", "29B1-234.56"),
        ("51F", "12345", "51F-123.45"),
        ("30A", "56789", "30A-567.89"),
    ]

    print("=== Two-Line Plate Tests ===")
    passed = 0
    for line1, line2, expected in cases:
        merged = merge_two_line_plate(line1, line2)
        result = parse_vietnamese_plate(merged)
        if result and result['formatted'] == expected:
            print(f"  PASS: [{line1}]+[{line2}] -> {result['formatted']}")
            passed += 1
        else:
            got = result['formatted'] if result else "None"
            print(f"  FAIL: [{line1}]+[{line2}] -> {got} (expected {expected})")

    print(f"  Result: {passed}/{len(cases)} passed\n")
    return passed, len(cases)


def test_format_plate_function():
    """Test the main format_plate entry point."""
    cases = [
        # Single line input
        ("30A-123.45", "30A-123.45", 1.0),
        ("30A12345", "30A-123.45", 1.0),
        # Multi-line input (motorcycle)
        ("29B1 23456", "29B1-234.56", 1.0),
    ]

    print("=== format_plate() Tests ===")
    passed = 0
    for raw, expected_plate, expected_min_score in cases:
        plate, score = format_plate(raw)
        if plate == expected_plate and score >= expected_min_score:
            print(f"  PASS: '{raw}' -> {plate} (score={score})")
            passed += 1
        else:
            print(f"  FAIL: '{raw}' -> {plate} (score={score}) (expected {expected_plate}, >={expected_min_score})")

    print(f"  Result: {passed}/{len(cases)} passed\n")
    return passed, len(cases)


def test_military_diplomatic():
    """Test military and diplomatic plates."""
    cases = [
        ("TM12345", "TM-12345", "military"),
        ("BB1234", "BB-1234", "military"),
        ("NG1234", "NG-1234", "diplomatic"),
        ("QT5678", "QT-5678", "diplomatic"),
    ]

    print("=== Military/Diplomatic Tests ===")
    passed = 0
    for raw, expected_fmt, expected_type in cases:
        result = parse_vietnamese_plate(raw)
        if result and result['formatted'] == expected_fmt and result['plate_type'] == expected_type:
            print(f"  PASS: {raw} -> {result['formatted']} ({result['plate_type']})")
            passed += 1
        else:
            got_fmt = result['formatted'] if result else "None"
            got_type = result['plate_type'] if result else "None"
            print(f"  FAIL: {raw} -> {got_fmt} ({got_type}) (expected {expected_fmt}, {expected_type})")

    print(f"  Result: {passed}/{len(cases)} passed\n")
    return passed, len(cases)


def test_invalid_plates():
    """Test that invalid inputs are rejected."""
    invalid_cases = [
        "",
        "ABC",
        "12345",
        "99Z99999999",  # Too long number
        "00A12345",     # Invalid province code 00
        "HELLO",
    ]

    print("=== Invalid Plate Rejection Tests ===")
    passed = 0
    for raw in invalid_cases:
        result = parse_vietnamese_plate(raw)
        if result is None:
            print(f"  PASS: '{raw}' correctly rejected")
            passed += 1
        else:
            print(f"  FAIL: '{raw}' should be None, got {result['formatted']}")

    print(f"  Result: {passed}/{len(invalid_cases)} passed\n")
    return passed, len(invalid_cases)


def test_province_names():
    """Test province name lookup."""
    cases = [
        (29, "Hà Nội"),
        (51, "TP.HCM"),
        (43, "Đà Nẵng"),
        (36, "Thanh Hóa"),
    ]

    print("=== Province Name Tests ===")
    passed = 0
    for code, expected in cases:
        got = get_province_name(code)
        if got == expected:
            print(f"  PASS: {code} -> {got}")
            passed += 1
        else:
            print(f"  FAIL: {code} -> {got} (expected {expected})")

    print(f"  Result: {passed}/{len(cases)} passed\n")
    return passed, len(cases)


if __name__ == "__main__":
    print("\n" + "=" * 50)
    print("  Vietnamese Plate Validator - Test Suite")
    print("=" * 50 + "\n")

    total_passed = 0
    total_tests = 0

    for test_fn in [
        test_standard_plates,
        test_ocr_corrections,
        test_two_line_plates,
        test_format_plate_function,
        test_military_diplomatic,
        test_invalid_plates,
        test_province_names,
    ]:
        p, t = test_fn()
        total_passed += p
        total_tests += t

    print("=" * 50)
    print(f"  TOTAL: {total_passed}/{total_tests} passed")
    if total_passed == total_tests:
        print("  ALL TESTS PASSED!")
    else:
        print(f"  {total_tests - total_passed} FAILED")
    print("=" * 50)
