#!/bin/bash
set -e
: "${PORT:=80}"
sed -i "s/80/${PORT}/g" /etc/apache2/ports.conf /etc/apache2/sites-enabled/000-default.conf
exec apache2-foreground
