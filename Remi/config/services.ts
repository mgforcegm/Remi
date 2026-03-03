export const servicesConfig = {
  googleCloud: {
    projectId: process.env.GOOGLE_CLOUD_PROJECT || '',
    credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS || './credentials/service-account.json',
  },

  bigquery: {
    dataset: process.env.BIGQUERY_DATASET || '',
    location: process.env.BIGQUERY_LOCATION || 'US',
    audienceTablePrefix: 'remi_sms_audience',
  },

  cloudTasks: {
    queue: process.env.CLOUD_TASKS_QUEUE || 'remi-dispatch-queue',
    location: process.env.CLOUD_TASKS_LOCATION || 'us-central1',
    dispatcherUrl: process.env.DISPATCHER_URL || '',
    dispatcherServiceAccount: process.env.DISPATCHER_SERVICE_ACCOUNT || '',
  },
};
