import { render, screen } from '@testing-library/react';
import { AiLabel, type AiLabelProps } from './AiLabel';

describe('AiLabel', () => {
  it.each<[AiLabelProps, string]>([
    [{ kind: 'finding', value: 'llm' }, 'AI-written'],
    [{ kind: 'finding', value: 'template' }, 'Template'],
    [{ kind: 'assessment', value: 'rules+llm' }, 'AI-assisted'],
    [{ kind: 'assessment', value: 'rules' }, 'Rules'],
    [{ kind: 'risk', value: 'llm' }, 'AI'],
    [{ kind: 'risk', value: 'rule+llm' }, 'Rules + AI'],
    [{ kind: 'risk', value: 'rule' }, 'Rules'],
  ])('%o -> %s', (props, text) => {
    render(<AiLabel {...props} />);
    // Exact match on the visible label; the tooltip explains it.
    const label = screen.getByText(text, { exact: true });
    expect(label.parentElement).toHaveAttribute('title');
  });

  it('marks AI and non-AI labels differently', () => {
    const { rerender, container } = render(<AiLabel kind="finding" value="llm" />);
    const aiClass = container.firstElementChild!.className;
    expect(container.querySelector('svg')).not.toBeNull(); // the AI sparkle
    rerender(<AiLabel kind="finding" value="template" />);
    expect(container.firstElementChild!.className).not.toBe(aiClass);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('names the model in the tooltip when AI was used', () => {
    render(<AiLabel kind="finding" value="llm" model="qwen3:8b" />);
    expect(screen.getByTitle(/qwen3:8b/)).toHaveTextContent('AI-written');
  });

  it('does not name a model for rule-based items', () => {
    render(<AiLabel kind="assessment" value="rules" model="qwen3:8b" />);
    expect(screen.queryByTitle(/qwen3:8b/)).not.toBeInTheDocument();
  });
});
