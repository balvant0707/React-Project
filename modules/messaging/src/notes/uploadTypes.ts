// Moved from npm-base into messaging on 2026-11-13; from the NPM tool (app/src/utils/uploadTypes.ts). Hand-owned now.
import type { UploadProps } from "antd";

// The argument of an antd Upload `customRequest`, derived from antd so we do not import rc-upload (a transitive
// dependency) directly.
export type UploadRequestOption = Parameters<NonNullable<UploadProps["customRequest"]>>[0];
