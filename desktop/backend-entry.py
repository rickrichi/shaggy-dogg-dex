"""Packaged market-data service. Configuration stays in the user's data folder."""
import multiprocessing
import os
import sys

if __name__ == "__main__":
    multiprocessing.freeze_support()
    from dotenv import load_dotenv
    config = os.environ.get("ARB_DESKTOP_ENV")
    if config:
        load_dotenv(config, override=False)
    if "--hedge" in sys.argv:
        sys.argv.remove("--hedge")
        from kraken_base_hedge import main as hedge_main
        try:
            hedge_main()
        except Exception as error:
            # Broker exceptions can include secrets; show only our own validation errors.
            print(str(error) if type(error) in (ValueError, RuntimeError) else "Hedge operation failed; inspect the journal")
            sys.exit(1)
        sys.exit(0)
    import uvicorn
    from app.main import app
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("ARB_DESKTOP_PORT", "8000")), log_level="info")
