#!/usr/bin/env node
import 'dotenv/config';
import { cli } from './cli.js';

cli.parse(process.argv);
