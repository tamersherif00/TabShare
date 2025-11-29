#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { TabShareStack } from '../lib/tabshare-stack';

const app = new cdk.App();

const env = process.env.ENVIRONMENT || 'dev';
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION || 'us-west-1';

new TabShareStack(app, `TabShare-${env}`, {
  env: {
    account,
    region,
  },
  environment: env,
});

app.synth();
