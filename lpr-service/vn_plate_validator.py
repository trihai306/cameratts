"""
Vietnamese License Plate Validator & Post-Processor
Handles all Vietnamese plate formats: personal, commercial, government, military, diplomatic, EV.
Supports both one-line (car) and two-line (motorcycle) plates.
"""

import re
from typing import Optional, Tuple

# 63 province/city codes in Vietnam
PROVINCE_CODES = {
    11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28,
    29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45,
    47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63,
    64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79,
    80, 81, 82, 83, 84, 85, 86, 88, 89, 90, 92, 93, 94, 95, 97, 98, 99
}

# Special series prefixes
GOVERNMENT_PREFIX = {43, 80}  # Blue plates
MILITARY_PREFIXES = {"TM", "KT", "BB", "BT", "KQ", "HQ", "BP", "QK", "QC", "AD", "TC", "QP", "HH", "TA", "PA"}

# Character confusion map: position-aware correction
# In Vietnamese plates: province code = digits, series = letters, number = digits
DIGIT_CORRECTIONS = {
    'O': '0', 'Q': '0', 'D': '0', 'U': '0', 'C': '0',
    'I': '1', 'L': '1', 'J': '1',
    'Z': '2',
    'S': '5',
    'G': '6',
    'T': '7',  # only when clearly in digit position
    'B': '8',
    'A': '4',  # A and 4 confusion in some fonts
}

LETTER_CORRECTIONS = {
    '0': 'O', 'Q': 'O',
    '1': 'I',
    '2': 'Z',
    '4': 'A',
    '5': 'S',
    '6': 'G',
    '7': 'T',
    '8': 'B',
}


def clean_raw_text(text: str) -> str:
    """Remove noise characters from raw OCR output."""
    # Remove spaces, dots, dashes, special chars
    cleaned = re.sub(r'[^A-Z0-9]', '', text.upper().strip())
    return cleaned


def correct_character(char: str, expect_digit: bool) -> str:
    """Correct a single character based on expected position type."""
    if expect_digit:
        if char.isdigit():
            return char
        return DIGIT_CORRECTIONS.get(char, char)
    else:
        if char.isalpha():
            return char
        return LETTER_CORRECTIONS.get(char, char)


def parse_vietnamese_plate(raw_text: str) -> Optional[dict]:
    """
    Parse and validate a Vietnamese license plate from raw OCR text.

    Vietnamese plate formats:
    1. Standard personal: [2 digits province][1-2 letters series]-[3-5 digits]
       Examples: 30A-12345, 51F-12345, 29B1-23456
    2. Commercial (yellow): Same format as personal
    3. Government (blue): 80A-12345
    4. Military (red): TM-1234 or similar
    5. Diplomatic: NG-1234 or QT-1234

    Returns dict with: province_code, series, number, formatted, plate_type
    """
    cleaned = clean_raw_text(raw_text)

    if len(cleaned) < 6:
        return None

    # Try military/diplomatic first (starts with letters)
    military_match = re.match(r'^([A-Z]{2})(\d{3,5})$', cleaned)
    if military_match:
        prefix = military_match.group(1)
        number = military_match.group(2)
        if prefix in MILITARY_PREFIXES:
            return {
                'province_code': None,
                'series': prefix,
                'number': number,
                'formatted': f"{prefix}-{number}",
                'plate_type': 'military'
            }
        if prefix in {"NG", "QT"}:
            return {
                'province_code': None,
                'series': prefix,
                'number': number,
                'formatted': f"{prefix}-{number}",
                'plate_type': 'diplomatic'
            }

    # Standard Vietnamese plate: 2-digit province + 1-2 letter series + 3-5 digit number
    # Try multiple parse interpretations and pick the best valid one
    if len(cleaned) >= 6:
        # First 2 chars should be digits (province code)
        province_str = ''.join(correct_character(c, expect_digit=True) for c in cleaned[:2])

        remaining = cleaned[2:]

        # First series char MUST be a letter (apply correction)
        if not remaining:
            return None
        first_series = correct_character(remaining[0], expect_digit=False)
        if not first_series.isalpha():
            if remaining[0].isalpha():
                first_series = remaining[0]
            else:
                return None

        # Try two interpretations:
        # 1) Series = 1 char (e.g., "A"), number = remaining[1:]
        # 2) Series = 2 chars (e.g., "B1" or "AA"), number = remaining[2:]
        candidates = []

        # Interpretation 1: single-letter series
        number_raw_1 = remaining[1:]
        number_1 = ''.join(correct_character(c, expect_digit=True) for c in number_raw_1)
        if number_1.isdigit() and 3 <= len(number_1) <= 5:
            candidates.append((first_series, number_1))

        # Interpretation 2: two-char series (if enough chars remain)
        if len(remaining) >= 2:
            second_char = remaining[1]
            # Second can be letter (AA, AB) or digit (A1, B1)
            if second_char.isalpha() or second_char.isdigit():
                series_2 = first_series + second_char
                number_raw_2 = remaining[2:]
                number_2 = ''.join(correct_character(c, expect_digit=True) for c in number_raw_2)
                if number_2.isdigit() and 3 <= len(number_2) <= 5:
                    candidates.append((series_2, number_2))

        if not candidates:
            return None

        # Pick best: prefer 5-digit number (most common), then 4, then 3
        # Among same digit count, prefer 1-char series (simpler)
        candidates.sort(key=lambda x: (len(x[1]), -len(x[0])), reverse=True)
        series, number = candidates[0]

        # Validate
        try:
            province_code = int(province_str)
        except ValueError:
            return None

        if province_code not in PROVINCE_CODES:
            return None

        if not (3 <= len(number) <= 5):
            return None

        if not number.isdigit():
            return None

        # Format with separator
        if len(number) <= 3:
            formatted_number = number
        elif len(number) == 4:
            formatted_number = f"{number[:2]}.{number[2:]}"
        else:  # 5 digits
            formatted_number = f"{number[:3]}.{number[3:]}"

        formatted = f"{province_str}{series}-{formatted_number}"

        # Determine plate type
        plate_type = 'personal'
        if province_code in GOVERNMENT_PREFIX:
            plate_type = 'government'

        return {
            'province_code': province_code,
            'series': series,
            'number': number,
            'formatted': formatted,
            'plate_type': plate_type
        }

    return None


def merge_two_line_plate(line1: str, line2: str) -> str:
    """
    Merge two lines of a motorcycle plate into single text.
    Line 1: province code + series (e.g., "29B1")
    Line 2: number part (e.g., "234.56" or "23456")
    """
    clean1 = clean_raw_text(line1)
    clean2 = clean_raw_text(line2)
    return clean1 + clean2


def format_plate(raw_text: str, lines: Optional[list[str]] = None) -> Tuple[str, float]:
    """
    Main entry point: format a raw OCR result into a valid Vietnamese plate.

    Args:
        raw_text: Raw OCR text (single string, possibly from multi-line)
        lines: Optional list of individual OCR lines (for two-line plates)

    Returns:
        Tuple of (formatted_plate, validation_confidence)
        validation_confidence: 1.0 = valid VN plate, 0.5 = partially valid, 0.0 = invalid
    """
    # If we have separate lines, try merging them
    candidates = [raw_text]

    if lines and len(lines) >= 2:
        # Try combining first two lines
        merged = merge_two_line_plate(lines[0], lines[1])
        candidates.insert(0, merged)
        # Also try each line combination
        for i in range(len(lines)):
            for j in range(i + 1, len(lines)):
                m = merge_two_line_plate(lines[i], lines[j])
                if m not in candidates:
                    candidates.append(m)

        # For two-line plates: OCR often reads extra digits on line 2
        # Try trimming line 2 from left and right
        clean1 = clean_raw_text(lines[0])
        clean2 = clean_raw_text(lines[1])
        # Trim from left (OCR may repeat last char of line 1)
        for trim_left in range(min(2, len(clean2))):
            trimmed = clean2[trim_left:]
            m = clean1 + trimmed
            if m not in candidates:
                candidates.append(m)
        # Trim from right (OCR may read noise after plate)
        for trim_right in range(1, min(3, len(clean2))):
            trimmed = clean2[:len(clean2) - trim_right]
            m = clean1 + trimmed
            if m not in candidates:
                candidates.append(m)

    # Try parsing each candidate
    for candidate in candidates:
        result = parse_vietnamese_plate(candidate)
        if result:
            return result['formatted'], 1.0

    # Second pass: try trimming the raw text itself (OCR added extra chars)
    cleaned_raw = clean_raw_text(raw_text)
    for trim in range(1, 3):
        # Trim from end
        if len(cleaned_raw) > trim + 6:
            result = parse_vietnamese_plate(cleaned_raw[:-trim])
            if result:
                return result['formatted'], 0.8
        # Trim from start
        if len(cleaned_raw) > trim + 6:
            result = parse_vietnamese_plate(cleaned_raw[trim:])
            if result:
                return result['formatted'], 0.7

    # Fallback: return cleaned text with low confidence
    cleaned = clean_raw_text(raw_text)
    if len(cleaned) >= 6:
        return cleaned, 0.3

    return raw_text.strip().upper(), 0.0


def get_province_name(code: int) -> str:
    """Get province/city name from plate code."""
    PROVINCE_NAMES = {
        11: "Cao Bằng", 12: "Lạng Sơn", 14: "Quảng Ninh", 15: "Hải Phòng",
        16: "Hải Phòng", 17: "Thái Bình", 18: "Nam Định", 19: "Phú Thọ",
        20: "Thái Nguyên", 21: "Yên Bái", 22: "Tuyên Quang", 23: "Hà Giang",
        24: "Lào Cai", 25: "Lai Châu", 26: "Sơn La", 27: "Điện Biên",
        28: "Hòa Bình", 29: "Hà Nội", 30: "Hà Nội", 31: "Hà Nội",
        32: "Hà Nội", 33: "Hà Nội", 34: "Hải Dương", 35: "Ninh Bình",
        36: "Thanh Hóa", 37: "Nghệ An", 38: "Hà Tĩnh", 39: "Đồng Nai",
        40: "Hà Nội", 41: "TP.HCM", 43: "Đà Nẵng", 47: "Đắk Lắk",
        48: "Đắk Nông", 49: "Lâm Đồng", 50: "TP.HCM", 51: "TP.HCM",
        52: "Bà Rịa-Vũng Tàu", 53: "Bình Thuận", 54: "Phú Yên",
        55: "Khánh Hòa", 56: "Ninh Thuận", 57: "Bình Định", 58: "Quảng Ngãi",
        59: "TP.HCM", 60: "Đồng Nai", 61: "Bình Dương", 62: "Long An",
        63: "Tiền Giang", 64: "Vĩnh Long", 65: "Cần Thơ", 66: "Đồng Tháp",
        67: "An Giang", 68: "Kiên Giang", 69: "Cà Mau", 70: "Tây Ninh",
        71: "Bến Tre", 72: "Bà Rịa-Vũng Tàu", 73: "Quảng Bình",
        74: "Quảng Trị", 75: "Thừa Thiên Huế", 76: "Quảng Nam",
        77: "Bình Phước", 78: "Phú Yên", 79: "Khánh Hòa",
        80: "Cơ quan TW", 81: "Gia Lai", 82: "Kon Tum",
        83: "Sóc Trăng", 84: "Trà Vinh", 85: "Bạc Liêu",
        86: "Hậu Giang", 88: "Vĩnh Phúc", 89: "Hưng Yên",
        90: "Hà Nam", 92: "Quảng Nam", 93: "Bình Phước",
        94: "Bắc Giang", 95: "Bắc Kạn", 97: "Bắc Ninh",
        98: "Hà Nội", 99: "Bắc Ninh"
    }
    return PROVINCE_NAMES.get(code, "Không xác định")
