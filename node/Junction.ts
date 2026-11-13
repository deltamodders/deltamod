import { execSync } from 'child_process';
import path from 'path';
import console from './Console.js';
import fs from 'fs';
import os from 'os';

function betweenDoubleQuotes(str: string): string {
    return `"${str}"`;
}

export function createJunction(target: string, path: string): string {
    console.log(`Creating junction from ${path} to ${target}`);
    try {
        fs.symlinkSync(target, path, "junction");
        return `Successfully created junction from ${path} to ${target}`
    } catch (err: any) {
        return err.toString();
    }
}

export function deleteJunction(path: string): string {
    console.log(`Deleting junction at ${path}`);
    try {
        fs.unlinkSync(path)
        return `Successfully deleted junction at ${path}`
    } catch (err: any) {
        return err.toString();
    }
}

export function isJunction(path: string): boolean {
    const stats = fs.lstatSync(path);
    return stats.isSymbolicLink()
}
