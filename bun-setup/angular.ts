import 'zone.js';
import 'zone.js/testing'
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { getTestBed } from '@angular/core/testing';
import { afterEach, beforeEach  } from 'bun:test';

function getCleanupHook(expectedTeardownValue: boolean) {
  return () => {
      const testBed = getTestBed();
      if ((testBed as any).shouldTearDownTestingModule() === expectedTeardownValue) {
          testBed.resetTestingModule();
      }
  };
}

getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting(),
);

beforeEach(getCleanupHook(false))
afterEach(getCleanupHook(true))