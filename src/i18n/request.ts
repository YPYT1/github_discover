import { getRequestConfig } from "next-intl/server";
import messages from "@/messages/en.json";
// Public server output is invariant. Browser/account preferences live in ClientIntlProvider.
export default getRequestConfig(async () => {
  return {
    locale: "en",
    messages,
  };
});
