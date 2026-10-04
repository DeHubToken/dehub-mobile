import React, { useRef } from 'react';
import { useSnapshot } from 'valtio';
import { uploadState } from '../../store/upload.store';

function UploadRuntime() {
  const { useUploadProcessor } = require('../../services/upload.processor');
  const Progress = require('./UploadProgressPill').default;
  useUploadProcessor();
  return <Progress />;
}

/** Restored jobs resume immediately; an empty queue loads no mint/upload code. */
export default function UploadRuntimeHost() {
  const { jobs } = useSnapshot(uploadState);
  const requested = useRef(false);
  if (jobs.length) requested.current = true;
  return requested.current ? <UploadRuntime /> : null;
}
