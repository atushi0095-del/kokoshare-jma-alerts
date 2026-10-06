import {GoogleAuth} from 'google-auth-library';

try {
  const credentials = JSON.parse(process.env.FCM_SERVICE_ACCOUNT || '{}');
  if (credentials.project_id !== 'annpinote-62e79') throw new Error('Wrong project');
  const auth = new GoogleAuth({credentials, scopes: ['https://www.googleapis.com/auth/firebase.messaging']});
  const client = await auth.getClient();
  const response = await client.request({
    url: `https://fcm.googleapis.com/v1/projects/${credentials.project_id}/messages:send`,
    method: 'POST', retry: false,
    data: {validate_only: true, message: {
      topic: 'kokoshare_jma_0000000_warning',
      data: {purpose: 'authorization-validation-only'},
      android: {priority: 'normal', ttl: '60s'}
    }}
  });
  console.log(JSON.stringify({status: response.status, validated: true, delivered: false}));
} catch (error) {
  console.error('FCM authorization check failed. Status:', Number(error?.response?.status) || 'unavailable');
  process.exitCode = 1;
}
