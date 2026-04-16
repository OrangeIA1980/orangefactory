from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    secret_key: str = "cambiar_en_produccion"
    database_url: str = "postgresql+psycopg://orangefactory:orangefactory@postgres:5432/orangefactory"
    access_token_expire_minutes: int = 60
    environment: str = "development"
    algorithm: str = "HS256"


settings = Settings()
