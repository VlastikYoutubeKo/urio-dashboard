from backend.app import create_app
from backend.models import Account
from backend.ur_api import fetch_devices, remove_device
from backend.routes import get_valid_jwt
import datetime
from dateutil.parser import isoparse
import time

app = create_app()

def run_cleanup():
    with app.app_context():
        accounts = Account.query.filter_by(is_active=True).all()
        now = datetime.datetime.now(datetime.timezone.utc)
        cutoff = now - datetime.timedelta(days=7)
        total_removed = 0
        total_failed = 0
        
        for account in accounts:
            jwt = get_valid_jwt(account)
            if not jwt:
                continue
            
            devices = fetch_devices(jwt)
            to_remove = []
            
            for d in devices:
                is_online = 'connections' in d and len(d['connections']) > 0
                if is_online:
                    continue
                
                auth_time_str = d.get('auth_time')
                if not auth_time_str:
                    continue
                    
                try:
                    auth_time = isoparse(auth_time_str)
                    if auth_time < cutoff:
                        to_remove.append(d.get('client_id'))
                except Exception:
                    pass
            
            print(f"[{account.username}] Nalezeno {len(to_remove)} offline zařízení (starších než 7 dní). Začínám mazat...")
            for client_id in to_remove:
                success, msg = remove_device(jwt, client_id)
                if success:
                    total_removed += 1
                else:
                    total_failed += 1
                # Malá pauza proti rate-limitingu
                time.sleep(0.1)
                
        print(f"\nHotovo! Úspěšně smazáno {total_removed} zařízení. Selhalo: {total_failed}")

if __name__ == '__main__':
    run_cleanup()
