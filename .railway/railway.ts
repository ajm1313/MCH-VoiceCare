import { defineRailway, postgres, preserve, project, redis, service, volume } from "railway/iac";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "sfo" });
  const Redis = redis("Redis", { region: "sfo" });
  Redis.deploy = { startCommand: "/bin/sh -c \"rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH\"" };
  const redisVolume = volume("redis-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "sfo", sizeMB: 5000 });
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "sfo", sizeMB: 5000 });
  const web = service("web", {
    replicas: { "sfo": 1 },
    start: "sh -c 'python manage.py sync_schema 2>&1 || true ; python manage.py migrate --noinput 2>&1 || (python manage.py migrate accounts --fake 0006 2>&1 ; python manage.py migrate clients --fake 0002 2>&1 ; python manage.py migrate core --fake 0008 2>&1 ; python manage.py migrate newborn --fake 0002 2>&1 ; python manage.py migrate pregnancy --fake 0002 2>&1 ; python manage.py migrate referrals --fake 0002 2>&1 ; python manage.py migrate --noinput 2>&1 || true) ; python manage.py ensure_admin_role 2>&1 || true ; gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 3 --access-logfile - --error-logfile - --log-level info'",
    env: {
      ALLOWED_HOSTS: preserve(),
      DATABASE_URL: preserve(),
      DEBUG: preserve(),
      DJANGO_SETTINGS_MODULE: preserve(),
      REDIS_URL: preserve(),
      SECRET_KEY: preserve(),
      SECURE_SSL_REDIRECT: preserve(),
      SEED_USER_FULL_NAME: preserve(),
      SEED_USER_PASSWORD: preserve(),
      SEED_USER_ROLE: preserve(),
      SEED_USER_USERNAME: preserve(),
    },
  });

  return project("miraculous-encouragement", {
    resources: [Postgres, Redis, web, redisVolume, postgresVolume],
  });
});
