#!/bin/bash

set -e


#############################################
# Ying-Mo V3.2 Production Deployment Script
#
# Flow:
# GitHub(main)
#      ↓
# git pull
#      ↓
# Backend migration
#      ↓
# Restart Gunicorn
#      ↓
# Frontend build
#      ↓
# Reload Nginx
#      ↓
# Health check
#############################################


#############################################
# Configuration
#############################################

PROJECT_DIR="/var/www/yingmo"

BRANCH="main"

BACKEND_DIR="$PROJECT_DIR/backend"

FRONTEND_DIR="$PROJECT_DIR/frontend"

BACKEND_SERVICE="yingmo"


#############################################
# Colors
#############################################

GREEN="\033[0;32m"
BLUE="\033[0;34m"
RED="\033[0;31m"
NC="\033[0m"



function info(){

    echo -e "${BLUE}[INFO]${NC} $1"

}


function success(){

    echo -e "${GREEN}[OK]${NC} $1"

}


function fail(){

    echo -e "${RED}[ERROR]${NC} $1"

    exit 1

}




#############################################
# Stage 0
# Environment Check
#############################################

info "Checking project environment..."


cd "$PROJECT_DIR" || fail "Project directory not found"



if [ ! -d ".git" ]; then

    fail "Not a git repository"

fi



CURRENT_BRANCH=$(git branch --show-current)


if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then

    fail "Current branch is $CURRENT_BRANCH, expected $BRANCH"

fi



if [ -n "$(git status --porcelain)" ]; then

    echo

    git status

    fail "Server has local changes. Deployment stopped."

fi



success "Environment check passed"





#############################################
# Stage 1
# Update Source Code
#############################################

info "Updating source code from GitHub..."


git fetch origin


LOCAL=$(git rev-parse HEAD)

REMOTE=$(git rev-parse origin/$BRANCH)



if [ "$LOCAL" = "$REMOTE" ]; then

    info "Already latest version"

else

    git pull origin "$BRANCH"

fi



COMMIT=$(git rev-parse --short HEAD)


success "Current commit: $COMMIT"






#############################################
# Stage 2
# Backend Deploy
#############################################

info "Deploying backend..."



cd "$BACKEND_DIR" || fail "Backend directory missing"



if [ ! -d ".venv" ]; then

    fail "Python virtual environment not found"

fi



source .venv/bin/activate



info "Installing backend dependencies..."


pip install -r requirements.txt



info "Running database migration..."


flask --app run.py db upgrade



success "Database migration completed"





info "Restarting Gunicorn service..."


sudo systemctl restart "$BACKEND_SERVICE"



sleep 3



SERVICE_STATUS=$(systemctl is-active "$BACKEND_SERVICE")



if [ "$SERVICE_STATUS" != "active" ]; then


    sudo systemctl status "$BACKEND_SERVICE"


    fail "Backend service failed"


fi



success "Backend restarted"






#############################################
# Stage 3
# Frontend Deploy
#############################################

info "Deploying frontend..."



cd "$FRONTEND_DIR" || fail "Frontend directory missing"



info "Installing frontend dependencies..."


npm ci



info "Building frontend..."


npm run build




if [ ! -f "$FRONTEND_DIR/dist/index.html" ]; then

    fail "Frontend build failed"

fi



success "Frontend build completed"






#############################################
# Stage 4
# Nginx Reload
#############################################

info "Checking nginx configuration..."


sudo nginx -t



success "Nginx configuration OK"



info "Reloading nginx..."


sudo systemctl reload nginx



success "Nginx reloaded"






#############################################
# Stage 5
# Health Check
#############################################

info "Checking backend health..."



if curl -fs \
http://127.0.0.1:8000/api/v1/health \
> /dev/null

then

    success "Backend health check passed"

else

    fail "Backend health check failed"

fi





info "Checking frontend build..."



if [ -f "$FRONTEND_DIR/dist/index.html" ]

then

    success "Frontend check passed"

else

    fail "Frontend check failed"

fi






#############################################
# Finished
#############################################


echo

echo "======================================"
echo " Ying-Mo V3.2 Deployment Successful "
echo " Commit : $COMMIT"
echo " Time   : $(date)"
echo "======================================"

echo