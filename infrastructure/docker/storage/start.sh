#!/bin/sh
# Démarre SeaweedFS avec une passerelle S3 privée : une seule identité, celle de l'API.
set -e
mkdir -p /etc/seaweedfs
cat > /etc/seaweedfs/s3.json <<JSON
{
  "identities": [
    {
      "name": "studymate-api",
      "credentials": [{ "accessKey": "${S3_ACCESS_KEY_ID}", "secretKey": "${S3_SECRET_ACCESS_KEY}" }],
      "actions": ["Admin", "Read", "Write", "List", "Tagging"]
    }
  ]
}
JSON
exec weed server -dir=/data -s3 -s3.port=8333 -s3.config=/etc/seaweedfs/s3.json -master.volumeSizeLimitMB=1024 -volume.max=0
