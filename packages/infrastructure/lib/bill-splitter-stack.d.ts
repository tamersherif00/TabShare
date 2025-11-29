import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
export interface TabShareStackProps extends cdk.StackProps {
    environment: string;
}
export declare class TabShareStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: TabShareStackProps);
}
