"""Print the current local agent pairing token from disk (or generate if absent)."""
from jarvis_local.config import get_settings

if __name__ == "__main__":
    s = get_settings()
    print("JARVIS Local URL : http://" + s.host + ":" + str(s.port))
    print("Token File       :", s.token_path)
    print("Pairing Token    :", s.auth_token)
