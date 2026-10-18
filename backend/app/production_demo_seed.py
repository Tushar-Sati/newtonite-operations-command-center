"""Create the synthetic demo tenant in a new, empty production PostgreSQL database.

This is a one-time bootstrap command. It requires an explicit confirmation flag,
APP_ENV=production, PostgreSQL, and a private NEWTONITE_DEMO_PASSWORD.
"""

from app.dev_seed import seed


if __name__ == "__main__":
    seed(production_demo=True)
