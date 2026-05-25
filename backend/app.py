import os
import logging
from flask import Flask, send_from_directory
from flask_cors import CORS
from backend.models import db, Setting
from backend.routes import api_bp, load_env
from backend.stats_routes import provider_bp
from backend.scheduler import init_scheduler

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

load_env()

class Config:
    SCHEDULER_API_ENABLED = True
    BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    INSTANCE_DIR = os.path.join(BASE_DIR, 'instance')
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", f"sqlite:///{os.path.join(INSTANCE_DIR, 'transfer_stats.db')}")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = os.getenv("SECRET_KEY", "default-secret-key-for-initial-setup")

def create_app():
    instance_path = Config.INSTANCE_DIR
    if not os.path.exists(instance_path):
        os.makedirs(instance_path)

    frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist'))
    app = Flask(__name__, static_folder=frontend_dist, static_url_path='')
    app.config.from_object(Config)

    # Enable CORS for the API routes so frontend development server can connect
    CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

    db.init_app(app)
    
    app.register_blueprint(api_bp)
    app.register_blueprint(provider_bp)

    with app.app_context():
        db.create_all()

    init_scheduler(app)

    # Serve React App
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve(path):
        if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
            return send_from_directory(app.static_folder, path)
        else:
            return send_from_directory(app.static_folder, 'index.html')

    @app.errorhandler(404)
    def not_found(e):
        return send_from_directory(app.static_folder, 'index.html')

    return app

if __name__ == '__main__':
    app = create_app()
    app.run(host='0.0.0.0', port=90, debug=True)
