import json

from db import get_connection


def execute_sql(sql: str) -> dict:
    """
    Execute a read-only SQL query against the hospital database.

    Only SELECT statements are allowed.
    """

    sql = sql.strip()

    # --------------------------------------------------
    # Safety check
    # --------------------------------------------------

    if not sql:
        return {
            "success": False,
            "error": "Empty SQL query."
        }

    # Remove trailing semicolon for easier validation
    normalized = sql.rstrip(";").strip()

    # Only allow SELECT queries
    if not normalized.lower().startswith("select"):
        return {
            "success": False,
            "error": "Only SELECT queries are allowed."
        }

    # Block potentially dangerous SQL keywords
    forbidden = [
        "insert ",
        "update ",
        "delete ",
        "drop ",
        "alter ",
        "truncate ",
        "create ",
        "grant ",
        "revoke ",
    ]

    lower_sql = normalized.lower()

    for keyword in forbidden:
        if keyword in lower_sql:
            return {
                "success": False,
                "error": f"SQL operation '{keyword.strip()}' is not allowed."
            }

    conn = get_connection()
    cur = conn.cursor()

    try:

        cur.execute(normalized)

        # Get column names
        columns = [
            description[0]
            for description in cur.description
        ]

        rows = cur.fetchall()

        # Convert rows into dictionaries
        results = []

        for row in rows:
            result = {}

            for column, value in zip(columns, row):
                result[column] = value

            results.append(result)

        return {
            "success": True,
            "columns": columns,
            "rows": results,
            "row_count": len(results)
        }

    except Exception as e:

        conn.rollback()

        return {
            "success": False,
            "error": str(e)
        }

    finally:

        cur.close()
        conn.close()
