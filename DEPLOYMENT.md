# Racfella Agent - Production Deployment Guide

This guide covers deploying the Racfella Agent using Docker Compose with Traefik for production.

## Prerequisites

1. **Docker and Docker Compose** installed on your server
2. **Traefik** running as a reverse proxy with:
   - External network named `proxy`
   - Let's Encrypt certificate resolver named `le`
   - Entry points: `web` (port 80) and `websecure` (port 443)
3. **Domain**: `racfella-agent.racfathers.io` pointing to your server

## Quick Deployment

### 1. Clone and Setup Environment

```bash
git clone <your-repo-url> racfella-agent
cd racfella-agent
cp .env.example .env
```

### 2. Configure Environment Variables

Edit `.env` file with your actual values:

```bash
# Required - Application will not start without these
POSTGRES_PASSWORD=your_secure_postgres_password
OPENROUTER_API_KEY=sk-or-your_openrouter_api_key
AES_ENCRYPTION_KEY=your_32_byte_encryption_key_in_hex_or_base64
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+1234567890

# Optional but recommended
REDIS_PASSWORD=your_secure_redis_password
MORALIS_API_KEY=your_moralis_api_key
ELEVENLABS_API_KEY=your_elevenlabs_api_key
```

### 3. Deploy with Docker Compose

For production deployment:

```bash
# Deploy with production configuration
docker-compose -f docker-compose.prod.yml up -d

# Or for development with local ports exposed
docker-compose up -d
```

### 4. Verify Deployment

Check that all services are running:

```bash
docker-compose -f docker-compose.prod.yml ps
```

Check application health:

```bash
curl https://racfella-agent.racfathers.io/health
```

## Architecture

The deployment includes:

- **App Container**: Node.js application with Express server
- **PostgreSQL**: Database with pgvector extension for embeddings
- **Redis**: Caching and session storage
- **Traefik**: Automatic HTTPS with Let's Encrypt

## Traefik Configuration

The application is configured with the following Traefik labels:

- **Domain**: `racfella-agent.racfathers.io`
- **HTTPS**: Automatic SSL/TLS with Let's Encrypt
- **Compression**: Enabled for better performance
- **CORS**: Configured for API access
- **HTTP → HTTPS**: Automatic redirect

## Monitoring & Maintenance

### View Logs

```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f app
```

### Update Application

```bash
# Pull latest changes
git pull

# Rebuild and deploy
docker-compose -f docker-compose.prod.yml up -d --build app
```

### Database Migrations

Migrations run automatically on container startup. To run manually:

```bash
docker-compose -f docker-compose.prod.yml exec app npx prisma migrate deploy
```

### Backup Database

```bash
# Create backup
docker-compose -f docker-compose.prod.yml exec db pg_dump -U postgres racfella > backup_$(date +%Y%m%d).sql

# Restore backup
docker-compose -f docker-compose.prod.yml exec -T db psql -U postgres racfella < backup.sql
```

## Security Considerations

- Database and Redis are only accessible internally
- Application runs as non-root user
- Strong passwords for database and Redis
- HTTPS enforced with automatic certificate management
- Environment variables for sensitive data

## Troubleshooting

### Health Check Fails

```bash
# Check application logs
docker-compose -f docker-compose.prod.yml logs app

# Check database connectivity
docker-compose -f docker-compose.prod.yml exec app wget -O- http://localhost:3000/health
```

### Database Connection Issues

```bash
# Check database status
docker-compose -f docker-compose.prod.yml exec db pg_isready -U postgres

# Reset database connection
docker-compose -f docker-compose.prod.yml restart app
```

### SSL Certificate Issues

Ensure:

1. Domain points to your server
2. Ports 80 and 443 are open
3. Traefik is properly configured with Let's Encrypt

## Environment Variables Reference

| Variable               | Required | Description                            |
| ---------------------- | -------- | -------------------------------------- |
| `POSTGRES_PASSWORD`    | Yes      | PostgreSQL database password           |
| `OPENROUTER_API_KEY`   | Yes      | API key for OpenRouter LLM service     |
| `AES_ENCRYPTION_KEY`   | Yes      | 32-byte encryption key (hex or base64) |
| `TWILIO_ACCOUNT_SID`   | Yes      | Twilio account identifier              |
| `TWILIO_AUTH_TOKEN`    | Yes      | Twilio authentication token            |
| `TWILIO_WHATSAPP_FROM` | Yes      | Twilio WhatsApp phone number           |
| `REDIS_PASSWORD`       | No       | Redis password (recommended)           |
| `MORALIS_API_KEY`      | No       | Moralis Web3 API key                   |
| `ELEVENLABS_API_KEY`   | No       | ElevenLabs speech synthesis API key    |
| `ALLOWED_ORIGINS`      | No       | CORS allowed origins                   |

## Support

For issues or questions:

1. Check application logs
2. Verify all required environment variables are set
3. Ensure Traefik proxy network exists
4. Confirm domain DNS is pointing to your server
