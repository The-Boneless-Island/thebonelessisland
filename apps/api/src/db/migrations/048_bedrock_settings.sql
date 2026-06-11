-- Amazon Bedrock provider settings. Bedrock authenticates via the AWS
-- credential chain (the EC2 instance role), so there is no API key — only a
-- region override. Falls back to AWS_REGION then us-east-1 in code when blank.

INSERT INTO server_settings (key, value, label, description, is_secret) VALUES
  (
    'bedrock_region',
    'us-east-1',
    'Bedrock Region',
    'AWS region for Amazon Bedrock Converse calls. Leave at us-east-1 unless your Bedrock models live elsewhere. Falls back to the AWS_REGION env var, then us-east-1, when blank.',
    FALSE
  )
ON CONFLICT (key) DO NOTHING;
