import { fireEvent, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MAX_UPLOAD_BYTES, checkPolicyFile } from '../api/policies';
import type { PolicyDocument } from '../api/types';
import { db } from '../mocks/db';
import { policiesFixture } from '../mocks/fixtures';
import { server } from '../mocks/server';
import { renderApp } from '../test/renderApp';
import { loginAsDemoUser } from '../test/session';

function pdf(name = 'fire-policy.pdf', size?: number): File {
  const file = new File(['%PDF-1.4 test'], name, { type: 'application/pdf' });
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
  return file;
}

async function openPolicies() {
  loginAsDemoUser();
  const result = renderApp('/app/policies');
  await screen.findByRole('heading', { name: 'Policies', level: 1 });
  return result;
}

/** Records upload requests; answers with `respond`. */
function captureUploads(respond: () => Response) {
  const calls: Request[] = [];
  server.use(
    http.post('*/api/v1/policies', ({ request }) => {
      calls.push(request);
      return respond();
    }),
  );
  return calls;
}

describe('checkPolicyFile', () => {
  it('accepts a PDF and rejects other types, empty and oversized files', () => {
    expect(checkPolicyFile(pdf())).toBeNull();
    expect(checkPolicyFile(new File(['x'], 'scan.PDF'))).toBeNull();
    expect(checkPolicyFile(new File(['x'], 'notes.txt', { type: 'text/plain' }))).toBe(
      'Only PDF files can be uploaded.',
    );
    expect(checkPolicyFile(pdf('empty.pdf', 0))).toBe('The file is empty.');
    expect(checkPolicyFile(pdf('big.pdf', MAX_UPLOAD_BYTES + 1))).toBe(
      'The file is larger than 25 MB.',
    );
  });
});

describe('policies page', () => {
  it('lists the policies with status, pages, sections and the flagged warning', async () => {
    await openPolicies();

    const list = await screen.findByRole('list', { name: 'Your policies' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(policiesFixture.length);

    const flood = items.find((item) => item.textContent?.includes('flood-extension.pdf'))!;
    expect(within(flood).getByText('Ready')).toBeInTheDocument();
    expect(flood).toHaveTextContent('1 page · 2 sections');
    expect(flood).toHaveTextContent('1 section contained text that looked like instructions');

    expect(screen.getByRole('link', { name: 'Start a new analysis →' })).toHaveAttribute(
      'href',
      '/app/analyses/new',
    );
  });

  it('shows the agent status in the header', async () => {
    await openPolicies();
    expect(await screen.findByText('All services up')).toBeInTheDocument();
  });

  it('shows an empty state with no policies', async () => {
    server.use(http.get('*/api/v1/policies', () => HttpResponse.json([])));
    await openPolicies();

    expect(await screen.findByText('No policies yet')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Start a new analysis →' })).not.toBeInTheDocument();
  });

  it('shows an error with a retry when the list cannot be loaded', async () => {
    // Fails twice: a 5xx read is retried once automatically before the error is shown.
    let failures = 0;
    server.use(
      http.get('*/api/v1/policies', () =>
        failures++ < 2 ? new HttpResponse(null, { status: 502 }) : undefined,
      ),
    );
    const { user } = await openPolicies();

    expect(await screen.findByText('Your policies could not be loaded')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: 'Your policies' })).toBeInTheDocument();
  });

  it('checks type and size before sending anything', async () => {
    const calls = captureUploads(() => HttpResponse.json({}));
    await openPolicies();

    fireEvent.drop(screen.getByTestId('dropzone'), {
      dataTransfer: {
        files: [
          new File(['hello'], 'notes.txt', { type: 'text/plain' }),
          pdf('huge.pdf', MAX_UPLOAD_BYTES + 1),
        ],
      },
    });

    const uploads = await screen.findByRole('list', { name: 'Uploads' });
    expect(within(uploads).getByText('Only PDF files can be uploaded.')).toBeInTheDocument();
    expect(within(uploads).getByText('The file is larger than 25 MB.')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('uploads a PDF and adds it to the list', async () => {
    const calls = captureUploads(() => {
      const document: PolicyDocument = {
        policy_id: 'POL-new000000001',
        business_id: 'B-test',
        filename: 'fire-policy.pdf',
        status: 'ready',
        page_count: 3,
        chunk_count: 6,
        flagged_chunk_count: 0,
        uploaded_at: new Date().toISOString(),
      };
      db.policies = [document, ...db.policies];
      return HttpResponse.json({ ...document, warnings: [] });
    });
    const { user } = await openPolicies();

    await user.upload(screen.getByLabelText('Upload policy PDFs'), pdf());

    const uploads = await screen.findByRole('list', { name: 'Uploads' });
    expect(await within(uploads).findByText('Uploaded')).toBeInTheDocument();
    expect(calls).toHaveLength(1);
    expect(calls[0].headers.get('Authorization')).toMatch(/^Bearer /);

    const list = screen.getByRole('list', { name: 'Your policies' });
    expect(await within(list).findByText('fire-policy.pdf')).toBeInTheDocument();
    expect(within(list).getAllByRole('listitem')).toHaveLength(policiesFixture.length + 1);
  });

  it.each([
    [400, 'invalid_pdf', 'The file is not a valid PDF.'],
    [413, 'file_too_large', 'The file is larger than 25 MB.'],
    [503, 'agent_unavailable', 'A required analysis service is not available.'],
  ])('shows the gateway message for a %i upload error', async (status, error, message) => {
    captureUploads(() =>
      HttpResponse.json(
        { error, message, ...(status === 503 ? { stage: 'policy_upload' } : {}) },
        { status },
      ),
    );
    const { user } = await openPolicies();

    await user.upload(screen.getByLabelText('Upload policy PDFs'), pdf());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The upload failed');
    expect(alert).toHaveTextContent(message);
    expect(within(screen.getByRole('list', { name: 'Uploads' })).getByText('Not uploaded'));
  });
});
