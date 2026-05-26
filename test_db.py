from backend.app import create_app
from backend.stats_routes import api_movers_detailed

app = create_app()
with app.app_context():
    res = api_movers_detailed()
    import json
    data = json.loads(res.get_data(as_text=True))
    for g in data['gainers'][:5]:
        print(g['code'], g['current'], g['deltas'].get('24h', 0))
