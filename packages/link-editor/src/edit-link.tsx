import { ActionPanel, Action, Form, showToast, Toast, Clipboard, showHUD } from "@raycast/api";
import { useEffect, useState, Fragment } from "react";
import dayjs from "dayjs";

interface URLParameter {
  id: string;
  key: string;
  value: string;
}

interface URLData {
  baseURL: string;
  params: URLParameter[];
}

interface Values {
  baseURL: string;
  [key: string]: string; // Dynamic parameter keys and values
}

export default function Command() {
  const [urlData, setUrlData] = useState<URLData | null>(null);
  const [parameters, setParameters] = useState<URLParameter[]>([]);

  /**
   * Generates a unique parameter ID
   * @param index - The parameter index
   * @returns Unique parameter ID string
   */
  function getParamId(index: number): string {
    return `param-${index}-${dayjs().valueOf()}`;
  }

  /**
   * Parses a URL string and extracts base URL and query parameters
   * @param url - The URL string to parse
   * @returns URLData object with baseURL and params, or null if invalid
   */
  function parseURL(url: string): URLData | null {
    try {
      const urlObj = new URL(url);
      console.log("🚀 ~ edit-link.tsx:24 ~ parseURL ~ urlObj:", urlObj);
      const params: URLParameter[] = [];

      let paramIndex = 0;
      urlObj.searchParams.forEach((value, key) => {
        params.push({
          id: getParamId(paramIndex++),
          key: key,
          value: value,
        });
      });

      console.log("🚀 ~ edit-link.tsx:26 ~ parseURL ~ params:", params);

      return {
        baseURL: `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`,
        params,
      };
    } catch {
      return null;
    }
  }

  /**
   * Reconstructs a URL with edited parameters
   * @param baseURL - The base URL without query parameters
   * @param params - Array of URL parameters to add
   * @returns Complete URL string with parameters
   */
  function reconstructURL(baseURL: string, params: URLParameter[]): string {
    const url = new URL(baseURL);

    // Clear existing search params
    url.search = "";

    // Add all parameters to the URL
    params.forEach(({ key, value }) => {
      if (key.trim() !== "" && value.trim() !== "") {
        url.searchParams.set(key.trim(), value.trim());
      }
    });

    return url.toString();
  }

  useEffect(() => {
    async function loadFromClipboard() {
      try {
        const clipboardText = await Clipboard.readText();

        if (!clipboardText) {
          // No clipboard text - start with empty form
          setUrlData({ baseURL: "", params: [] });
          setParameters([]);
          return;
        }

        const parsed = parseURL(clipboardText);

        if (!parsed) {
          // Invalid URL - start with clipboard text as base URL and empty parameters
          setUrlData({ baseURL: "", params: [] });
          setParameters([]);
          return;
        }

        // Valid URL - load parsed data
        setUrlData(parsed);
        setParameters(parsed.params);
      } catch (err) {
        // Error reading clipboard - start with empty form
        setUrlData({ baseURL: "", params: [] });
        setParameters([]);
        console.error("Clipboard error:", err);
      }
    }

    loadFromClipboard();
  }, []);

  /**
   * Adds a new empty parameter to the form
   */
  const addParameter = () => {
    const newParam: URLParameter = {
      id: getParamId(parameters.length),
      key: "",
      value: "",
    };
    setParameters([...parameters, newParam]);
  };

  /**
   * Removes a parameter from the form by ID
   * @param id - The unique ID of the parameter to remove
   */
  const removeParameter = (id: string) => {
    setParameters(parameters.filter((param) => param.id !== id));
  };

  /**
   * Handles form submission and updates the URL with edited parameters
   * @param values - Form values containing baseURL and parameter data
   */
  async function handleSubmit(values: Values) {
    if (!urlData) {
      showToast({
        style: Toast.Style.Failure,
        title: "Error",
        message: "No URL data available",
      });
      return;
    }

    try {
      // Extract base URL
      const baseURL = values.baseURL;

      // Build parameters from form values
      const updatedParams: URLParameter[] = [];
      parameters.forEach((param) => {
        const keyFieldId = `key-${param.id}`;
        const valueFieldId = `value-${param.id}`;
        const key = values[keyFieldId] || param.key;
        const value = values[valueFieldId] || param.value;

        if (key.trim() !== "") {
          updatedParams.push({
            id: param.id,
            key: key.trim(),
            value: value.trim(),
          });
        }
      });

      // Reconstruct URL with edited parameters
      const newUrl = reconstructURL(baseURL, updatedParams);

      // Copy to clipboard
      await Clipboard.copy(newUrl);

      showHUD("📋 Updated URL copied to clipboard");
    } catch (err) {
      showToast({
        style: Toast.Style.Failure,
        title: "Error",
        message: "Failed to update URL",
      });
      console.error("Submit error:", err);
    }
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm onSubmit={handleSubmit} title="Update URL" />
          <Action onAction={addParameter} title="Add Param" shortcut={{ modifiers: ["cmd"], key: "n" }} />
          <ActionPanel.Section title="Param Actions">
            {parameters.map((param, index) => (
              <Action
                key={param.id}
                onAction={() => removeParameter(param.id)}
                title={`Remove Param ${index + 1}`}
                style={Action.Style.Destructive}
              />
            ))}
          </ActionPanel.Section>
        </ActionPanel>
      }
    >
      <Form.TextField
        id="baseURL"
        title="Base URL"
        value={urlData?.baseURL || ""}
        onChange={(newValue) => setUrlData({ baseURL: newValue, params: urlData?.params || [] })}
        placeholder="Enter base URL (e.g., https://example.com/path)"
      />

      <Form.Separator />

      {parameters.length > 0 ? (
        <>
          {parameters.map((param, index) => (
            <Fragment key={param.id}>
              <Form.TextField
                id={`key-${param.id}`}
                title={`Param ${index + 1} - Key`}
                defaultValue={param.key}
                placeholder="Parameter name (e.g., 'id', 'name')"
              />
              <Form.TextField
                id={`value-${param.id}`}
                title={`Param ${index + 1} - Value`}
                defaultValue={param.value}
                placeholder="Parameter value"
              />
              {index < parameters.length - 1 && <Form.Separator />}
            </Fragment>
          ))}
        </>
      ) : (
        <Form.Description text="No params. Use 'Add Param' to create." />
      )}
    </Form>
  );
}
