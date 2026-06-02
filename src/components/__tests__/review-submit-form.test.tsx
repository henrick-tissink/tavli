import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReviewSubmitForm } from "@/components/review-submit-form";
import { MessagesProvider } from "@/lib/i18n/messages-provider";
import roReviews from "@/messages/ro/reviews.json";

const submit = jest.fn();
jest.mock("@/app/(public)/[lang]/reviews/[token]/actions", () => ({
  submitReviewByToken: (...args: unknown[]) => submit(...args),
}));

function renderForm(initialRating = 0) {
  return render(
    <MessagesProvider locale="ro" bundle={{ reviews: roReviews }}>
      <ReviewSubmitForm token="tok" initialRating={initialRating} />
    </MessagesProvider>,
  );
}

describe("ReviewSubmitForm", () => {
  beforeEach(() => {
    submit.mockReset();
    submit.mockResolvedValue({ ok: true });
  });

  test("pre-selects rating from initialRating prop", () => {
    renderForm(4);
    const stars = screen.getAllByRole("radio");
    expect(stars[3]).toBeChecked();
  });

  test("submitting sends current rating + comment to action", async () => {
    renderForm(3);
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
    renderForm(5);
    fireEvent.click(screen.getByRole("checkbox", { name: /nota medie/i }));
    fireEvent.click(screen.getByRole("button", { name: /trimite/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit).toHaveBeenCalledWith(
      "tok",
      expect.objectContaining({ includeInAggregate: true }),
    );
  });

  test("renders success state after ok response", async () => {
    renderForm(5);
    fireEvent.click(screen.getByRole("button", { name: /trimite/i }));
    await screen.findByText(/Mulțumim/i);
  });

  test("renders inline error from action", async () => {
    submit.mockResolvedValueOnce({ ok: false, error: "Recenzie deja trimisă." });
    renderForm(5);
    fireEvent.click(screen.getByRole("button", { name: /trimite/i }));
    await screen.findByText(/Recenzie deja trimisă/i);
  });
});
