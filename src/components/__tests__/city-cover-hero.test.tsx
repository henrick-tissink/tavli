import { render, screen, fireEvent } from "@testing-library/react";
import { CityCoverHero } from "../city-cover-hero";

test("renders greeting, city, and singular/plural variants", () => {
  const { rerender } = render(
    <CityCoverHero
      cityDisplay="București"
      greeting="Bună dimineața"
      availableTonightCount={1}
      onSearch={jest.fn()}
    />
  );
  expect(screen.getByText(/Bună dimineața/)).toBeInTheDocument();
  expect(screen.getByText(/București,/)).toBeInTheDocument();
  expect(screen.getByText(/1 loc disponibil/)).toBeInTheDocument();
  rerender(
    <CityCoverHero
      cityDisplay="București"
      greeting="x"
      availableTonightCount={5}
      onSearch={jest.fn()}
    />
  );
  expect(screen.getByText(/5 locuri disponibile/)).toBeInTheDocument();
});

test("Caută o masă button triggers onSearch", () => {
  const onSearch = jest.fn();
  render(
    <CityCoverHero
      cityDisplay="București"
      greeting="x"
      availableTonightCount={0}
      onSearch={onSearch}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: /Caută o masă/i }));
  expect(onSearch).toHaveBeenCalled();
});
