import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route } from '@solidjs/router';
import HomePage from './HomePage';

describe('HomePage', () => {
  it('renders hero section with title, tagline, and CTA button', async () => {
    render(
      () => (
        <MemoryRouter url="/">
          <Route path="/" component={() => <HomePage />} />
        </MemoryRouter>
      )
    );

    await vi.waitFor(() => {
      expect(screen.getByText('EdaTime')).toBeInTheDocument();
    });
    expect(
      screen.getByText('Interactive time-series analytics — upload a CSV or Parquet, explore, and export.')
    ).toBeInTheDocument();
    expect(screen.getByText('Upload a file to get started')).toBeInTheDocument();
  });

  it('renders all three sample dataset cards with correct content', async () => {
    render(
      () => (
        <MemoryRouter url="/">
          <Route path="/" component={() => <HomePage />} />
        </MemoryRouter>
      )
    );

    await vi.waitFor(() => {
      expect(screen.getByText('Load ETTm2 sample dataset')).toBeInTheDocument();
    });
    expect(screen.getByText('Load Sinusoidal sample dataset')).toBeInTheDocument();
    expect(screen.getByText('Load Weather sample dataset')).toBeInTheDocument();
    expect(screen.getByText('70,320 rows × 7 columns')).toBeInTheDocument();
    expect(screen.getByText('5,000 rows × 4 columns')).toBeInTheDocument();
    expect(screen.getByText('5,000 rows × 5 columns')).toBeInTheDocument();
  });

  it('calls sessionStorage.setItem when a sample dataset is clicked', async () => {
    render(
      () => (
        <MemoryRouter url="/">
          <Route path="/" component={() => <HomePage />} />
        </MemoryRouter>
      )
    );

    await vi.waitFor(() => {
      screen.getByText('Load ETTm2 sample dataset');
    });

    const spy = vi.spyOn(sessionStorage, 'setItem');
    await userEvent.click(screen.getByText('Load ETTm2 sample dataset'));
    expect(spy).toHaveBeenCalledWith('sampleDataset', 'ettm2');
  });

  it('renders all four recommended workflow cards with correct hrefs', async () => {
    render(
      () => (
        <MemoryRouter url="/">
          <Route path="/" component={() => <HomePage />} />
        </MemoryRouter>
      )
    );

    await vi.waitFor(() => {
      expect(screen.getByRole('link', { name: /Upload .*1/ })).toBeInTheDocument();
    });

    const uploadCard = screen.getByRole('link', { name: /Upload .*1/ });
    expect(uploadCard).toHaveAttribute('href', '/upload');

    const timeseriesCard = screen.getByRole('link', { name: /Timeseries .*2/ });
    expect(timeseriesCard).toHaveAttribute('href', '/timeseries');

    const correlationsCard = screen.getByRole('link', { name: /Correlations .*7/ });
    expect(correlationsCard).toHaveAttribute('href', '/heatmap');

    const scatterCard = screen.getByRole('link', { name: /Scatter \/ Density .*3/ });
    expect(scatterCard).toHaveAttribute('href', '/scatter');
  });

  it('renders all three advanced analysis cards with correct hrefs', async () => {
    render(
      () => (
        <MemoryRouter url="/">
          <Route path="/" component={() => <HomePage />} />
        </MemoryRouter>
      )
    );

    await vi.waitFor(() => {
      expect(screen.getByRole('link', { name: /FFT \/ PSD .*6/ })).toBeInTheDocument();
    });

    const fftCard = screen.getByRole('link', { name: /FFT \/ PSD .*6/ });
    expect(fftCard).toHaveAttribute('href', '/fft');

    const causalCard = screen.getByRole('link', { name: /Causal Discovery .*9/ });
    expect(causalCard).toHaveAttribute('href', '/causal');

    const driftCard = screen.getByRole('link', { name: /Drift Analysis .*0/ });
    expect(driftCard).toHaveAttribute('href', '/drift');
  });

  it('renders keyboard shortcuts section with all four groups', async () => {
    render(
      () => (
        <MemoryRouter url="/">
          <Route path="/" component={() => <HomePage />} />
        </MemoryRouter>
      )
    );

    await vi.waitFor(() => {
      expect(screen.getByText('Navigation')).toBeInTheDocument();
    });
    expect(screen.getByText('Chart')).toBeInTheDocument();
    expect(screen.getByText('Session')).toBeInTheDocument();
    expect(screen.getByText('Drift')).toBeInTheDocument();
  });
});