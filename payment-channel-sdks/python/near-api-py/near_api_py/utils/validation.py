def validate_account_id(account_id: str):
    if len(account_id) < 2:
        raise ValueError("Account id too short")
    if len(account_id) > 64:
        raise ValueError("Account id too long")

    last_char_is_separator = True

    for c in account_id:
        if ord("a") <= ord(c) <= ord("z") or ord("0") <= ord(c) <= ord("9"):
            current_char_is_separator = False
        elif c in ["-", "_", "."]:
            current_char_is_separator = True
        else:
            raise ValueError(f"Invalid character: {c}")

        if current_char_is_separator and last_char_is_separator:
            raise ValueError("Redundant separator")

        last_char_is_separator = current_char_is_separator

    if last_char_is_separator:
        raise ValueError("Redundant separator")
