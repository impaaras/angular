/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import * as ts from 'typescript';

import {absoluteFrom as _, FileSystem, getFileSystem, getSourceFileOrError, NgtscCompilerHost, setFileSystem} from '../../file_system';
import {runInEachFileSystem} from '../../file_system/testing';
import {NoopIncrementalBuildStrategy} from '../../incremental';
import {ClassDeclaration, isNamedClassDeclaration} from '../../reflection';
import {ReusedProgramStrategy} from '../../typecheck';

import {NgCompilerOptions} from '../api';

import {NgCompiler} from '../src/compiler';
import {NgCompilerHost} from '../src/host';

runInEachFileSystem(() => {
  describe('NgCompiler', () => {
    let fs: FileSystem;

    beforeEach(() => {
      fs = getFileSystem();
      fs.ensureDir(_('/node_modules/@angular/core'));
      fs.writeFile(_('/node_modules/@angular/core/index.d.ts'), `
        export declare const Component: any;
      `);
    });

    it('should also return template diagnostics when asked for component diagnostics', () => {
      const COMPONENT = _('/cmp.ts');
      fs.writeFile(COMPONENT, `
        import {Component} from '@angular/core';
        @Component({
          selector: 'test-cmp',
          templateUrl: './template.html',
        })
        export class Cmp {}
      `);
      fs.writeFile(_('/template.html'), `{{does_not_exist.foo}}`);

      const options: NgCompilerOptions = {
        strictTemplates: true,
      };
      const baseHost = new NgtscCompilerHost(getFileSystem(), options);
      const host = NgCompilerHost.wrap(baseHost, [COMPONENT], options, /* oldProgram */ null);
      const program = ts.createProgram({host, options, rootNames: host.inputFiles});
      const compiler = new NgCompiler(
          host, options, program, new ReusedProgramStrategy(program, host, options, []),
          new NoopIncrementalBuildStrategy(), /** enableTemplateTypeChecker */ false);

      const diags = compiler.getDiagnostics(getSourceFileOrError(program, COMPONENT));
      expect(diags.length).toBe(1);
      expect(diags[0].messageText).toContain('does_not_exist');
    });

    describe('getComponentsWithTemplateFile', () => {
      it('should return the component(s) using a template file', () => {
        const templateFile = _('/template.html');
        fs.writeFile(templateFile, `This is the template, used by components CmpA and CmpC`);
        const cmpAFile = _('/cmp-a.ts');
        fs.writeFile(cmpAFile, `
            import {Component} from '@angular/core';
            @Component({
              selector: 'cmp-a',
              templateUrl: './template.html',
            })
            export class CmpA {}
          `);
        const cmpBFile = _('/cmp-b.ts');
        fs.writeFile(cmpBFile, `
            import {Component} from '@angular/core';
            @Component({
              selector: 'cmp-b',
              template: 'CmpB does not use an external template',
            })
            export class CmpB {}
          `);
        const cmpCFile = _('/cmp-c.ts');
        fs.writeFile(cmpCFile, `
            import {Component} from '@angular/core';
            @Component({
              selector: 'cmp-c',
              templateUrl: './template.html',
            })
            export class CmpC {}
          `);

        const options: NgCompilerOptions = {};

        const baseHost = new NgtscCompilerHost(getFileSystem(), options);
        const host = NgCompilerHost.wrap(
            baseHost, [cmpAFile, cmpBFile, cmpCFile], options, /* oldProgram */ null);
        const program = ts.createProgram({host, options, rootNames: host.inputFiles});
        const CmpA = getClass(getSourceFileOrError(program, cmpAFile), 'CmpA');
        const CmpC = getClass(getSourceFileOrError(program, cmpCFile), 'CmpC');
        const compiler = new NgCompiler(
            host, options, program, new ReusedProgramStrategy(program, host, options, []),
            new NoopIncrementalBuildStrategy(), /** enableTemplateTypeChecker */ false);
        const components = compiler.getComponentsWithTemplateFile(templateFile);
        expect(components).toEqual(new Set([CmpA, CmpC]));
      });
    });
  });
});


function getClass(sf: ts.SourceFile, name: string): ClassDeclaration<ts.ClassDeclaration> {
  for (const stmt of sf.statements) {
    if (isNamedClassDeclaration(stmt) && stmt.name.text === name) {
      return stmt;
    }
  }
  throw new Error(`Class ${name} not found in file: ${sf.fileName}: ${sf.text}`);
}
