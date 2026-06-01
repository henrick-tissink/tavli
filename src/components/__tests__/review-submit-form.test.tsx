import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReviewSubmitForm } from "@/components/review-submit-form";

const submit = jest.fn();
jest.mock("@/app/(public)/[lang]/reviews/[token]/actions", () => ({
  submitReviewByToken: (...args: unknown[]) => submit(...args),
}));

describe("ReviewSubmitForm", () => {
  beforeEach(() => {
    submit.mockReset();
    submit.mockResolvedValue({ ok: true });
  });

  test("pre-selects rating from initialRating prop", () => {
    render(<ReviewSubmitForm token="tok" initialRating={4} />);
    const stars = screen.getAllByRole("radio");
    expect(stars[3]).toBeChecked();
  });

  test("submitting sends current rating + comment to action", async () => {
    render(<ReviewSubmitForm token="tok" initialRating={3} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Great food" },
    });
    fireEvent.click(screen.getByRole("button", { name: /trimite/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit).toHaveBeenCalledWith("tok", {
      rating: 3,
      comment: "Great food",
      includeInAggregate: false,
    });
  });

  test("passes aggregate consent when the checkbox is ticked (C3)", async () => {
    render(<ReviewSubmitForm token="tok" initialRating={5} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /nota medie/i }));
    fireEvent.click(screen.getByRole("button", { name: /trimite/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit).toHaveBeenCalledWith(
      "tok",
      expect.objectContaining({ includeInAggregate: true }),
    );
  });

  test("renders success state after ok response", async () => {
    render(<ReviewSubmitForm token="tok" initialRating={5} />);
    fireEvent.click(screen.getByRole("button", { name: /trimite/i }));
    await screen.findByText(/Mulțumim/i);
  });

  test("renders inline error from action", async () => {
    submit.mockResolvedValueOnce({ ok: false, error: "Recenzie deja trimisă." });
    render(<ReviewSubmitForm token="tok" initialRating={5} />);
    fireEvent.click(screen.getByRole("button", { name: /trimite/i }));
    await screen.findByText(/Recenzie deja trimisă/i);
  });
});
